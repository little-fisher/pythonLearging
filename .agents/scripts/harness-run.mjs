#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'help';
const agentsDir = path.resolve(getArg('agents-dir', path.resolve(scriptDir, '..')));
const runsDir = path.resolve(getArg('runs-dir', path.join(agentsDir, 'project/harness/runs')));

main();

function main() {
  try {
    if (command === 'help' || hasFlag('help') || hasFlag('h')) return printHelp();
    if (command === 'start') return startRun();
    if (command === 'scope') return scopeRun();
    if (command === 'evidence') return addEvidence();
    if (command === 'evaluate') return evaluateRun();
    if (command === 'close') return closeRun();
    if (command === 'status') return statusRun();
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    if (hasFlag('json')) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    } else {
      console.error(`harness-run: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

function startRun() {
  const task = getTask();
  if (!task) throw new Error('--task or --task-file is required');

  const runId = sanitizeId(getArg('run-id', timestampId()));
  const runDir = getRunDir(runId);
  if (fs.existsSync(runDir) && !hasFlag('overwrite')) {
    throw new Error(`run already exists: ${runId}`);
  }

  fs.mkdirSync(runDir, { recursive: true });
  const now = nowIso();
  const run = {
    ...readRunTemplate(),
    run_id: runId,
    status: 'draft',
    task: {
      title: getArg('title', task.slice(0, 120)),
      source_request: task
    },
    created_at: now,
    updated_at: now,
    agents_dir: agentsDir,
    run_dir: runDir
  };
  appendTransition(run, null, 'draft', 'start');

  writeJson(path.join(runDir, 'run.json'), run);
  writeMarkdown(path.join(runDir, run.paths.context_pack), renderContextPack(run, { pending: true }));
  writeJson(path.join(runDir, run.paths.contract), baseContract(run));
  writeMarkdown(path.join(runDir, run.paths.evidence), '# Evidence\n\n');
  writeMarkdown(path.join(runDir, run.paths.evaluator_report), '# Evaluator Report\n\n- decision: pending\n');
  writeMarkdown(path.join(runDir, run.paths.outcome), '# Outcome\n\n- status: pending\n');

  printResult({
    ok: true,
    action: 'start',
    run_id: runId,
    status: run.status,
    run_dir: runDir,
    next: `node .agents/scripts/harness-run.mjs scope --run-id ${runId}`
  }, renderStartSummary);
}

function scopeRun() {
  const { run, runDir } = loadRun();
  requireStatus(run, ['draft']);

  const task = run.task?.source_request || run.task?.title || '';
  const primaryType = getArg('primary-type', inferTaskType(task));
  const secondaryTypes = csv(getArg('secondary-types', ''));
  const size = getArg('size', inferTaskSize(task, primaryType, secondaryTypes));
  const scopeIn = repeated('in');
  const scopeOut = repeated('out');
  const assumptions = repeated('assumption');
  const successes = repeated('success');
  const validation = getArg('validation', getArg('steps', '人工或命令验证目标行为成立'));
  const validationMethod = getArg('validation-method', validation.includes('node ') || validation.includes('npm ') ? 'command' : 'manual');
  const manualBoundary = getArg('manual-boundary', '');
  const noContextNeeded = hasFlag('no-context-needed');
  const noContextReason = getArg('no-context-reason', noContextNeeded ? '任务范围足够明确，无需额外上下文。' : '');
  const qualityGates = buildQualityGates({
    task,
    size,
    primaryType,
    secondaryTypes,
    explicit: repeated('qa-gate'),
    disabled: hasFlag('no-qa-gates'),
    note: getArg('qa-note', '')
  });

  run.classification = {
    size,
    primary_type: primaryType,
    secondary_types: secondaryTypes
  };
  run.scope = {
    in: scopeIn.length ? scopeIn : [run.task.source_request || run.task.title],
    out: scopeOut,
    assumptions
  };
  run.context = {
    no_context_needed: noContextNeeded,
    reason: noContextReason
  };
  run.quality_gates = qualityGates;

  const criteriaTexts = successes.length ? successes : ['用户原始需求在声明范围内得到满足'];
  const contract = {
    ...baseContract(run),
    task: {
      id: run.run_id,
      title: run.task.title,
      source_request: run.task.source_request,
      status: 'scoped',
      owner: 'agent'
    },
    routing: {
      primary_type: primaryType,
      secondary_type: secondaryTypes.join(', '),
      docs_to_read: [],
      implementation_anchors: []
    },
    scope: run.scope,
    quality_gates: qualityGates,
    success_criteria: criteriaTexts.map((text, index) => ({
      id: `SC-${index + 1}`,
      description: text,
      type: getArg('criteria-type', 'behavior'),
      required: true,
      validation: {
        method: validationMethod,
        command_or_steps: validation,
        manual_boundary: manualBoundary
      },
      status: 'untested',
      evidence: []
    }))
  };

  writeJson(path.join(runDir, run.paths.contract), contract);
  writeMarkdown(path.join(runDir, run.paths.context_pack), renderContextPack(run, { pending: false }));
  setStatus(run, 'scoped', 'scope');
  writeRun(runDir, run);

  printResult({
    ok: true,
    action: 'scope',
    run_id: run.run_id,
    status: run.status,
    size,
    primary_type: primaryType,
    quality_gates: qualityGates.length,
    success_criteria: contract.success_criteria.length,
    next: `node .agents/scripts/harness-run.mjs evidence --run-id ${run.run_id} --validation "..." --result "..."`
  }, renderScopeSummary);
}

function addEvidence() {
  const { run, runDir } = loadRun();
  if (run.status === 'draft') throw new Error('cannot add evidence before scope');
  if (run.status === 'closed') throw new Error('cannot add evidence to a closed run');
  if (run.status === 'evaluated' && run.evaluator?.decision !== 'fail' && !hasFlag('reopen')) {
    throw new Error('cannot add evidence after evaluation unless decision is fail or --reopen is set');
  }

  if (run.status === 'scoped') {
    assertContextReady(run, runDir);
    setStatus(run, 'running', 'evidence:auto-running');
  } else if (run.status === 'evaluated') {
    setStatus(run, 'running', 'evidence:reopen');
  }

  requireStatus(run, ['running', 'evidence_ready']);

  const validation = getArg('validation', '');
  const result = getArg('result', '');
  const risk = getArg('risk', '');
  const cannotVerify = hasFlag('cannot-verify');
  const gateId = getArg('gate', '');
  const gateStatus = getArg('gate-status', cannotVerify ? 'blocked' : 'passed');
  const artifacts = repeated('artifact');
  const reason = getArg('reason', '');
  if (!validation && !cannotVerify) throw new Error('--validation is required unless --cannot-verify is set');
  if (!result && !cannotVerify) throw new Error('--result is required unless --cannot-verify is set');
  if (cannotVerify && !reason) throw new Error('--reason is required with --cannot-verify');

  const evidenceId = getArg('evidence-id', `EV-${String((run.evidence || []).length + 1).padStart(3, '0')}`);
  const criteriaId = getArg('criteria', 'SC-1');
  const entry = {
    id: evidenceId,
    criteria_id: criteriaId,
    at: nowIso(),
    validation: validation || 'cannot verify',
    result: result || 'cannot verify',
    risk,
    gate_id: gateId,
    gate_status: gateId ? gateStatus : '',
    artifacts,
    cannot_verify: cannotVerify,
    reason
  };

  if (gateId) assertQualityGateInput(run, gateId, gateStatus);
  appendEvidenceMarkdown(path.join(runDir, run.paths.evidence), entry);
  run.evidence = [...(run.evidence || []), entry];
  if (gateId) updateQualityGate(run, gateId, evidenceId, gateStatus, cannotVerify ? reason : '');
  updateContractEvidence(path.join(runDir, run.paths.contract), criteriaId, evidenceId, cannotVerify ? 'blocked' : 'tested');

  if (run.status !== 'evidence_ready') setStatus(run, 'evidence_ready', 'evidence');
  run.updated_at = nowIso();
  writeRun(runDir, run);

  printResult({
    ok: true,
    action: 'evidence',
    run_id: run.run_id,
    status: run.status,
    evidence_id: evidenceId,
    next: `node .agents/scripts/harness-run.mjs evaluate --run-id ${run.run_id} --decision pass --report "..."`
  }, renderEvidenceSummary);
}

function evaluateRun() {
  const { run, runDir } = loadRun();
  requireStatus(run, ['evidence_ready']);
  if (!hasEvidence(run)) throw new Error('cannot evaluate without evidence or cannot-verify reason');

  const decision = getArg('decision', '');
  if (!['pass', 'fail', 'blocked'].includes(decision)) {
    throw new Error('--decision must be pass, fail, or blocked');
  }
  if (decision === 'pass') assertQualityGatesPassed(run);

  const blockers = repeated('blocker');
  if (decision === 'blocked' && blockers.length) {
    run.blockers = [...(run.blockers || []), ...blockers];
  }

  const report = getReportText(decision);
  writeMarkdown(path.join(runDir, run.paths.evaluator_report), report);
  run.evaluator = {
    decision,
    report_path: run.paths.evaluator_report
  };
  setStatus(run, 'evaluated', 'evaluate');
  writeRun(runDir, run);

  printResult({
    ok: true,
    action: 'evaluate',
    run_id: run.run_id,
    status: run.status,
    decision,
    next: decision === 'fail'
      ? `node .agents/scripts/harness-run.mjs evidence --run-id ${run.run_id} --validation "..." --result "..."`
      : `node .agents/scripts/harness-run.mjs close --run-id ${run.run_id}`
  }, renderEvaluateSummary);
}

function closeRun() {
  const { run, runDir } = loadRun();
  requireStatus(run, ['evaluated']);
  const decision = run.evaluator?.decision;
  if (decision === 'fail') throw new Error('failed runs cannot be closed; add more evidence and evaluate again');
  if (decision === 'blocked' && !(run.blockers || []).length) {
    throw new Error('blocked runs require at least one blocker before close');
  }
  if (decision !== 'pass' && decision !== 'blocked') {
    throw new Error('run evaluator decision must be pass or blocked before close');
  }
  if (decision === 'pass') assertQualityGatesPassed(run);

  const outcome = getOutcomeText(run);
  writeMarkdown(path.join(runDir, run.paths.outcome), outcome);
  setStatus(run, 'closed', 'close');
  writeRun(runDir, run);

  printResult({
    ok: true,
    action: 'close',
    run_id: run.run_id,
    status: run.status,
    decision,
    outcome_path: path.join(runDir, run.paths.outcome)
  }, renderCloseSummary);
}

function statusRun() {
  const { run, runDir } = loadRun();
  printResult({
    ok: true,
    action: 'status',
    run_id: run.run_id,
    status: run.status,
    decision: run.evaluator?.decision || 'pending',
    evidence_count: (run.evidence || []).length,
    quality_gates: run.quality_gates || [],
    blockers: run.blockers || [],
    run_dir: runDir
  }, renderStatusSummary);
}

function getTask() {
  const inlineTask = getArg('task', '');
  const taskFile = getArg('task-file', '');
  if (inlineTask) return inlineTask.trim();
  if (taskFile) return fs.readFileSync(path.resolve(taskFile), 'utf8').trim();
  return '';
}

function loadRun() {
  const runId = getArg('run-id', '');
  const runDirArg = getArg('run-dir', '');
  const runDir = runDirArg ? path.resolve(runDirArg) : getRunDir(requiredRunId(runId));
  const runPath = path.join(runDir, 'run.json');
  if (!fs.existsSync(runPath)) throw new Error(`run.json not found: ${runPath}`);
  return { run: readJson(runPath), runDir };
}

function requiredRunId(value) {
  if (!value) throw new Error('--run-id is required');
  return sanitizeId(value);
}

function getRunDir(runId) {
  return path.join(runsDir, sanitizeId(runId));
}

function readRunTemplate() {
  const templatePath = path.join(agentsDir, 'core/templates/run.json');
  if (fs.existsSync(templatePath)) return readJson(templatePath);
  return {
    schema_version: '1.0',
    run_id: '',
    status: 'draft',
    task: { title: '', source_request: '' },
    classification: { size: '', primary_type: '', secondary_types: [] },
    scope: { in: [], out: [], assumptions: [] },
    context: { no_context_needed: false, reason: '' },
    paths: {
      context_pack: 'context-pack.md',
      contract: 'contract.json',
      evidence: 'evidence.md',
      evaluator_report: 'evaluator-report.md',
      outcome: 'outcome.md'
    },
    evaluator: { decision: 'pending', report_path: '' },
    quality_gates: [],
    evidence: [],
    blockers: [],
    transitions: []
  };
}

function baseContract(run) {
  return {
    schema_version: '1.0',
    task: {
      id: run.run_id,
      title: run.task?.title || '',
      source_request: run.task?.source_request || '',
      status: 'draft',
      owner: 'agent'
    },
    routing: {
      primary_type: '',
      secondary_type: '',
      docs_to_read: [],
      implementation_anchors: []
    },
    scope: {
      in: [],
      out: [],
      assumptions: []
    },
    success_criteria: [],
    risk_controls: {
      stop_conditions: [],
      rollback_or_recovery: '',
      permissions_or_external_dependencies: []
    },
    evaluator: {
      required: true,
      report_path: run.paths?.evaluator_report || 'evaluator-report.md',
      decision: 'pending'
    },
    change_log: []
  };
}

function renderContextPack(run, options) {
  const lines = [];
  lines.push('# Context Pack');
  lines.push('');
  lines.push(`- run_id: ${run.run_id}`);
  lines.push(`- status: ${options.pending ? 'pending' : 'scoped'}`);
  lines.push(`- task: ${run.task?.source_request || run.task?.title || ''}`);
  lines.push(`- size: ${run.classification?.size || 'unknown'}`);
  lines.push(`- primary_type: ${run.classification?.primary_type || 'unknown'}`);
  if (run.context?.no_context_needed) lines.push(`- no_context_needed: ${run.context.reason || 'yes'}`);
  if ((run.quality_gates || []).length) {
    lines.push('');
    lines.push('## Quality Gates');
    lines.push('');
    for (const gate of run.quality_gates) {
      lines.push(`- ${gate.id}: ${gate.type} (${gate.status || 'pending'}) - ${gate.description}`);
    }
  }
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  for (const item of run.scope?.in || []) lines.push(`- in: ${item}`);
  for (const item of run.scope?.out || []) lines.push(`- out: ${item}`);
  for (const item of run.scope?.assumptions || []) lines.push(`- assumption: ${item}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function appendEvidenceMarkdown(filePath, entry) {
  const lines = [];
  lines.push('');
  lines.push(`## ${entry.id}`);
  lines.push('');
  lines.push(`- at: ${entry.at}`);
  lines.push(`- criteria_id: ${entry.criteria_id}`);
  lines.push(`- validation: ${entry.validation}`);
  lines.push(`- result: ${entry.result}`);
  if (entry.gate_id) lines.push(`- gate: ${entry.gate_id}`);
  if (entry.gate_status) lines.push(`- gate_status: ${entry.gate_status}`);
  for (const artifact of entry.artifacts || []) lines.push(`- artifact: ${artifact}`);
  if (entry.risk) lines.push(`- risk: ${entry.risk}`);
  if (entry.cannot_verify) lines.push(`- cannot_verify: ${entry.reason}`);
  lines.push('');
  fs.appendFileSync(filePath, lines.join('\n'));
}

function updateContractEvidence(filePath, criteriaId, evidenceId, status) {
  if (!fs.existsSync(filePath)) return;
  const contract = readJson(filePath);
  const criteria = Array.isArray(contract.success_criteria) ? contract.success_criteria : [];
  const target = criteria.find((item) => item.id === criteriaId) || criteria[0];
  if (!target) return;
  target.evidence = Array.isArray(target.evidence) ? target.evidence : [];
  if (!target.evidence.includes(evidenceId)) target.evidence.push(evidenceId);
  target.status = status;
  contract.change_log = Array.isArray(contract.change_log) ? contract.change_log : [];
  contract.change_log.push({
    at: nowIso(),
    change: `Added evidence ${evidenceId} to ${target.id}`
  });
  writeJson(filePath, contract);
}

function updateQualityGate(run, gateId, evidenceId, status, reason) {
  const target = assertQualityGateInput(run, gateId, status);
  target.status = status;
  target.evidence = Array.isArray(target.evidence) ? target.evidence : [];
  if (!target.evidence.includes(evidenceId)) target.evidence.push(evidenceId);
  if (reason) target.reason = reason;
}

function assertQualityGateInput(run, gateId, status) {
  const gates = Array.isArray(run.quality_gates) ? run.quality_gates : [];
  const target = gates.find((gate) => gate.id === gateId || gate.type === gateId);
  if (!target) {
    const available = gates.map((gate) => gate.id).join(', ') || 'none';
    throw new Error(`unknown QA gate "${gateId}" (available: ${available})`);
  }
  if (!['passed', 'failed', 'blocked'].includes(status)) {
    throw new Error('--gate-status must be passed, failed, or blocked');
  }
  return target;
}

function assertQualityGatesPassed(run) {
  const gates = Array.isArray(run.quality_gates) ? run.quality_gates : [];
  const missing = gates.filter((gate) => {
    if (gate.required === false) return false;
    return gate.status !== 'passed' || !(gate.evidence || []).length;
  });
  if (!missing.length) return;
  throw new Error(`cannot pass with unsatisfied QA gates: ${missing.map((gate) => `${gate.id}:${gate.status || 'pending'}`).join(', ')}`);
}

function getReportText(decision) {
  const fromFile = getArg('report-file', '');
  if (fromFile) return fs.readFileSync(path.resolve(fromFile), 'utf8');
  const report = getArg('report', '');
  const lines = [];
  lines.push('# Evaluator Report');
  lines.push('');
  lines.push(`- decision: ${decision}`);
  if (report) lines.push(`- report: ${report}`);
  if (repeated('blocker').length) {
    lines.push('');
    lines.push('## Blockers');
    for (const blocker of repeated('blocker')) lines.push(`- ${blocker}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function getOutcomeText(run) {
  const fromFile = getArg('outcome-file', '');
  if (fromFile) return fs.readFileSync(path.resolve(fromFile), 'utf8');
  const outcome = getArg('outcome', '');
  const lines = [];
  lines.push('# Outcome');
  lines.push('');
  lines.push(`- run_id: ${run.run_id}`);
  lines.push(`- decision: ${run.evaluator?.decision || 'pending'}`);
  lines.push(`- evidence_count: ${(run.evidence || []).length}`);
  if (outcome) lines.push(`- summary: ${outcome}`);
  if ((run.blockers || []).length) {
    lines.push('');
    lines.push('## Blockers');
    for (const blocker of run.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function assertContextReady(run, runDir) {
  if (run.context?.no_context_needed) return;
  const contextPath = path.join(runDir, run.paths.context_pack || 'context-pack.md');
  if (!fs.existsSync(contextPath) || !fs.readFileSync(contextPath, 'utf8').trim()) {
    throw new Error('context is required before running; use scope with --no-context-needed if appropriate');
  }
}

function hasEvidence(run) {
  return (run.evidence || []).some((item) => item.validation || item.cannot_verify);
}

function requireStatus(run, allowed) {
  if (!allowed.includes(run.status)) {
    throw new Error(`expected status ${allowed.join(' or ')}, got ${run.status}`);
  }
}

function setStatus(run, to, reason) {
  const from = run.status || null;
  if (from === to) return;
  appendTransition(run, from, to, reason);
  run.status = to;
  run.updated_at = nowIso();
}

function appendTransition(run, from, to, reason) {
  run.transitions = Array.isArray(run.transitions) ? run.transitions : [];
  run.transitions.push({
    at: nowIso(),
    from,
    to,
    command,
    reason
  });
}

function writeRun(runDir, run) {
  writeJson(path.join(runDir, 'run.json'), run);
}

function inferTaskType(text) {
  const normalized = String(text).toLowerCase();
  const rules = [
    ['bug-fix', ['bug', 'fix', '修复', '报错', '错误', '异常', '失败', '不生效', '残留', '错位']],
    ['interaction-change', ['交互', '点击', '按钮', '弹窗', '状态', '切换', 'hover']],
    ['page-build', ['页面', '模块', '布局', '大屏', '视觉', '组件']],
    ['asset-data-update', ['图片', 'svg', 'pdf', 'json', 'csv', '数据', '资源', '脚本', '生成']],
    ['regression', ['回归', '验证', '检查', 'review', '评审']],
    ['requirement-change', ['需求', '修改', '调整', '改造', '规则', '工程化', '模板', '治理']]
  ];
  return rules.find(([, keys]) => keys.some((key) => normalized.includes(key)))?.[0] || 'requirement-change';
}

function inferTaskSize(text, primaryType, secondaryTypes) {
  const normalized = String(text).toLowerCase();
  if (['长期', '多轮', '分阶段', '路线图', '接手', '月度', '季度'].some((key) => normalized.includes(key))) return 'long';
  if (['跨模块', '跨状态', '跨路由', '公开接口', '地图', 'canvas', '工程化', '自动', 'hook', 'figma', '设计规范', '截图比对', '接口', 'network', '状态码', '后端'].some((key) => normalized.includes(key))) return 'complex';
  if (secondaryTypes.length >= 2) return 'complex';
  if (primaryType === 'regression' && normalized.length > 120) return 'complex';
  if (normalized.length < 80 && ['文案', '改字', '格式', '单文件'].some((key) => normalized.includes(key))) return 'micro';
  return 'normal';
}

function buildQualityGates({ task, size, primaryType, secondaryTypes, explicit, disabled, note }) {
  if (disabled) return [];
  const normalized = String(task || '').toLowerCase();
  const gateTypes = new Set(explicit.map(normalizeGateType).filter(Boolean));

  if (size === 'complex' || size === 'long') {
    const uiTask = primaryType === 'page-build'
      || primaryType === 'interaction-change'
      || containsAny(normalized, ['页面', '前端', 'ui', '视觉', '设计', 'figma', '截图', '样式', '交互', '浏览器', '大屏']);
    const visualTask = containsAny(normalized, ['figma', '设计', '视觉', '截图', '还原', '样式', '大屏']);
    const apiTask = containsAny(normalized, ['接口', 'api', 'network', '请求', '后端', '状态码', '返回', '响应', 'ts', '类型', 'schema', 'openapi', 'swagger', 'dto']);

    if (uiTask) gateTypes.add('runtime-console');
    if (visualTask) gateTypes.add('visual-compare');
    if (apiTask && uiTask) gateTypes.add('runtime-network');
    if (apiTask) gateTypes.add('api-contract');
  }

  return [...gateTypes].map((type) => ({
    id: `QG-${type}`,
    type,
    required: true,
    source: explicit.map(normalizeGateType).includes(type) ? 'explicit' : 'inferred',
    description: qualityGateDescription(type),
    status: 'pending',
    evidence: [],
    note
  }));
}

function normalizeGateType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    console: 'runtime-console',
    'runtime-console': 'runtime-console',
    network: 'runtime-network',
    'runtime-network': 'runtime-network',
    visual: 'visual-compare',
    screenshot: 'visual-compare',
    figma: 'visual-compare',
    'visual-compare': 'visual-compare',
    api: 'api-contract',
    contract: 'api-contract',
    'api-contract': 'api-contract',
    a11y: 'accessibility-smoke',
    accessibility: 'accessibility-smoke',
    'accessibility-smoke': 'accessibility-smoke'
  };
  return aliases[normalized] || '';
}

function qualityGateDescription(type) {
  const descriptions = {
    'runtime-console': '真实页面无阻塞 console error，相关 warning 已记录风险。',
    'runtime-network': '关键 network 请求状态码和响应摘要已核验，失败请求已记录。',
    'visual-compare': '实际页面截图已与设计规范、Figma 或参考截图比对。',
    'api-contract': '接口响应已与 TS、OpenAPI、DTO、schema 或后端定义对照。',
    'accessibility-smoke': '关键交互入口可聚焦、可点击，核心文本可读。'
  };
  return descriptions[type] || type;
}

function containsAny(text, keys) {
  return keys.some((key) => text.includes(String(key).toLowerCase()));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMarkdown(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function timestampId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || timestampId();
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function repeated(name) {
  const value = args[name];
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => csv(item)).filter(Boolean);
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (!item.startsWith('--')) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = rawArgs[index + 1];
    const value = next && !next.startsWith('--') ? next : true;
    if (value !== true) index += 1;
    if (parsed[key] !== undefined) {
      parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], value] : [parsed[key], value];
    } else {
      parsed[key] = value;
    }
  }
  return parsed;
}

function getArg(name, fallback) {
  const value = args[name];
  if (Array.isArray(value)) return value.at(-1);
  return value === undefined ? fallback : value;
}

function hasFlag(name) {
  return args[name] === true;
}

function printResult(data, renderer) {
  if (hasFlag('json')) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(renderer(data));
  }
}

function renderStartSummary(data) {
  return [
    `harness-run start: ${data.run_id}`,
    `status: ${data.status}`,
    `run_dir: ${data.run_dir}`,
    `next: ${data.next}`,
    ''
  ].join('\n');
}

function renderScopeSummary(data) {
  return [
    `harness-run scope: ${data.run_id}`,
    `status: ${data.status}`,
    `size: ${data.size}`,
    `primary_type: ${data.primary_type}`,
    `quality_gates: ${data.quality_gates}`,
    `success_criteria: ${data.success_criteria}`,
    `next: ${data.next}`,
    ''
  ].join('\n');
}

function renderEvidenceSummary(data) {
  return [
    `harness-run evidence: ${data.run_id}`,
    `status: ${data.status}`,
    `evidence_id: ${data.evidence_id}`,
    `next: ${data.next}`,
    ''
  ].join('\n');
}

function renderEvaluateSummary(data) {
  return [
    `harness-run evaluate: ${data.run_id}`,
    `status: ${data.status}`,
    `decision: ${data.decision}`,
    `next: ${data.next}`,
    ''
  ].join('\n');
}

function renderCloseSummary(data) {
  return [
    `harness-run close: ${data.run_id}`,
    `status: ${data.status}`,
    `decision: ${data.decision}`,
    `outcome_path: ${data.outcome_path}`,
    ''
  ].join('\n');
}

function renderStatusSummary(data) {
  const lines = [
    `harness-run status: ${data.run_id}`,
    `status: ${data.status}`,
    `decision: ${data.decision}`,
    `evidence_count: ${data.evidence_count}`,
    `run_dir: ${data.run_dir}`
  ];
  if (data.quality_gates.length) {
    lines.push('quality_gates:');
    for (const gate of data.quality_gates) lines.push(`- ${gate.id}: ${gate.status || 'pending'}`);
  }
  if (data.blockers.length) {
    lines.push('blockers:');
    for (const blocker of data.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('');
  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(`harness-run - single-task Harness Core state machine

Usage:
  harness-run start --task "..."
  harness-run scope --run-id <id> [--size normal] [--primary-type requirement-change] [--success "..."] [--qa-gate visual-compare]
  harness-run evidence --run-id <id> --validation "..." --result "..." [--gate QG-visual-compare] [--artifact path]
  harness-run evaluate --run-id <id> --decision pass|fail|blocked [--report "..."]
  harness-run close --run-id <id> [--outcome "..."]
  harness-run status --run-id <id>

Options:
  --agents-dir <path>  Defaults to the parent of this script.
  --runs-dir <path>    Defaults to .agents/project/harness/runs.
  --qa-gate <type>     Adds a required QA gate. Types: runtime-console, runtime-network, visual-compare, api-contract, accessibility-smoke.
  --no-qa-gates        Disables inferred QA gates for this run.
  --gate <id>          Binds evidence to a QA gate.
  --gate-status <s>    passed, failed, or blocked. Defaults to passed, or blocked with --cannot-verify.
  --json               Emit JSON.
`);
}
