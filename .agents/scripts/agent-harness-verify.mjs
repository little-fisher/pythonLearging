#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const agentsDir = path.resolve(getArg('agents-dir', path.resolve(scriptDir, '..')));
const hasProjectLayer = fs.existsSync(path.join(agentsDir, 'project'));
const templateMode = Boolean(args.template) || !hasProjectLayer;
const errors = [];
const warnings = [];
const passes = [];

main();

function main() {
  if (!fs.existsSync(agentsDir)) {
    fail(`agents dir does not exist: ${agentsDir}`);
    finish();
  }

  checkRequiredFiles();
  checkWikiIndex('index.md');
  checkJsonFiles();
  checkAgentsEntry();
  checkCoreBoundary();
  checkCurrentContract();
  checkVagueSuccessCriteria();
  checkRunArtifacts();
  checkProjectGraphArtifacts();

  finish();
}

function checkRequiredFiles() {
  const required = [
    'AGENTS.md',
    'index.md',
    'scripts/agent-context-pack.mjs',
    'scripts/agent-codegraph.mjs',
    'scripts/agent-project-profile.mjs',
    'scripts/agent-project-graph.mjs',
    'scripts/harness-run.mjs',
    'scripts/knowledge-feedback-quality.mjs',
    'scripts/agent-llm-wiki.mjs',
    'scripts/agent-knowledge-feedback.mjs',
    'scripts/agent-knowledge-feedback-hook.mjs',
    'scripts/agent-harness-verify.mjs',
    'core/harness/HARNESS_CORE_SPEC.md',
    'core/harness/README.md',
    'core/harness/task-intake.md',
    'core/harness/context-pack.md',
    'core/harness/cost-budget.md',
    'core/harness/project-graph.md',
    'core/harness/tool-capability-matrix.md',
    'core/harness/experience-extraction.md',
    'core/harness/long-task-orchestration.md',
    'core/harness/task-routing.md',
    'core/harness/project-initialization.md',
    'core/harness/task-contract.md',
    'core/harness/evaluator.md',
    'core/templates/run.json',
    'core/templates/task-contract.json',
    'core/templates/evaluator-report.md',
    'core/templates/experience-report.md',
    'core/validation/done-definition.md',
    'core/validation/test-matrix.md',
    'core/validation/evidence-report.md',
    'core/validation/qa-gates.md',
    'core/memory/realtime-memory.md'
  ];

  if (!templateMode) {
    required.push(
      'project/charter.md',
      'project/task-routing-overrides.md'
    );
  }

  const missing = required.filter((relPath) => !exists(relPath));
  if (missing.length) {
    fail(`missing required files:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`required files present (${required.length})`);
}

function checkWikiIndex(relPath) {
  if (!exists(relPath)) return;

  const indexPath = resolveInAgents(relPath);
  const base = path.dirname(indexPath);
  const text = readFile(indexPath);
  const linkableFiles = walkFiles(agentsDir);
  const targets = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].split('|')[0].split('#')[0].trim())
    .filter(Boolean);

  const unresolved = [];
  for (const target of targets) {
    const direct = path.resolve(base, target);
    const agentRelative = path.resolve(agentsDir, target);
    const cwdRelative = path.resolve(process.cwd(), target);
    const candidates = [
      direct,
      `${direct}.md`,
      agentRelative,
      `${agentRelative}.md`,
      cwdRelative,
      `${cwdRelative}.md`
    ];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      const targetBase = path.basename(target);
      const basenameMatch = linkableFiles.some((filePath) => {
        return path.basename(filePath) === targetBase || path.basename(filePath, path.extname(filePath)) === targetBase;
      });
      if (!basenameMatch) unresolved.push(target);
    }
  }

  if (unresolved.length) {
    fail(`${relPath} has unresolved wiki links:\n${unresolved.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`${relPath} wiki links resolved (${targets.length})`);
}

function checkJsonFiles() {
  const jsonFiles = walkFiles(agentsDir, (filePath) => filePath.endsWith('.json'));
  const invalid = [];

  for (const filePath of jsonFiles) {
    try {
      JSON.parse(readFile(filePath));
    } catch (error) {
      invalid.push(`${relative(filePath)}: ${error.message}`);
    }
  }

  if (invalid.length) {
    fail(`invalid JSON files:\n${invalid.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`JSON files parse (${jsonFiles.length})`);
}

function checkAgentsEntry() {
  if (!exists('AGENTS.md')) return;

  const text = readRel('AGENTS.md');
  const requiredRefs = [
    'core/harness/task-intake.md',
    'core/harness/context-pack.md',
    'core/harness/task-contract.md',
    'core/harness/evaluator.md'
  ];

  if (!templateMode) {
    requiredRefs.push(
      'core/harness/task-routing.md',
      'project/charter.md',
      'project/task-routing-overrides.md',
      'core/validation/test-matrix.md'
    );
  }

  const missing = requiredRefs.filter((needle) => !text.includes(needle));
  if (missing.length) {
    fail(`AGENTS.md is missing required references:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`AGENTS.md references required harness entries (${requiredRefs.length})`);
}

function checkCoreBoundary() {
  const coreDir = resolveInAgents('core');
  if (!fs.existsSync(coreDir)) return;

  const forbidden = [
    ...loadForbiddenCorePatterns(),
    ...getRepeatedArg('forbid-in-core')
  ].filter(Boolean);

  if (!forbidden.length) {
    pass('core boundary has no forbidden patterns configured');
    return;
  }

  const targetFiles = walkFiles(coreDir, (filePath) => /\.(md|json|mjs|js)$/.test(filePath));
  const hits = [];
  for (const filePath of targetFiles) {
    const text = readFile(filePath);
    for (const pattern of forbidden) {
      if (text.includes(pattern)) {
        hits.push(`${relative(filePath)} contains "${pattern}"`);
      }
    }
  }

  if (hits.length) {
    fail(`project-specific content found in core:\n${hits.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`core boundary clean (${forbidden.length} forbidden patterns)`);
}

function checkCurrentContract() {
  const contractPath = resolveInAgents('project/memory/current/contract.json');
  if (!fs.existsSync(contractPath)) {
    if (!templateMode) warn('current contract not found: project/memory/current/contract.json');
    return;
  }

  let contract;
  try {
    contract = JSON.parse(readFile(contractPath));
  } catch {
    return;
  }

  const criteria = Array.isArray(contract.success_criteria) ? contract.success_criteria : [];
  if (!contract.task?.id) fail('current contract is missing task.id');
  if (!contract.task?.status) fail('current contract is missing task.status');
  if (!criteria.length) fail('current contract has no success_criteria');

  const requiredCriteria = criteria.filter((item) => item.required !== false);
  if (contract.task?.status === 'completed') {
    const unpassed = requiredCriteria.filter((item) => item.status !== 'passed');
    if (unpassed.length) {
      fail(`completed contract has unpassed required criteria:\n${unpassed.map((item) => `  - ${item.id || '(missing id)'}`).join('\n')}`);
    }

    if (contract.evaluator?.required !== false && contract.evaluator?.decision !== 'pass') {
      fail(`completed contract evaluator decision must be "pass", got "${contract.evaluator?.decision || 'missing'}"`);
    }
  } else {
    warn(`current contract is ${contract.task?.status}; structure checked but completion gates skipped`);
  }

  if (contract.evaluator?.report_path) {
    const reportPath = resolveContractPath(contract.evaluator.report_path);
    if (!fs.existsSync(reportPath)) {
      fail(`evaluator report_path does not exist: ${contract.evaluator.report_path}`);
    }
  }

  pass(`current contract structure checked (${requiredCriteria.length} required criteria)`);
}

// 可执行兜底:把 HARNESS_CORE_SPEC「模糊目标 MUST 转可观察标准」从劝导文档变为强制检查。
// 扫描所有 contract.json 的 success_criteria 描述,命中模糊词即判失败。
function checkVagueSuccessCriteria() {
  const vaguePatterns = [
    '体验更好',
    '尽量优化',
    '优化一下',
    '更好一些',
    '更好一点',
    '差不多就行',
    '看情况',
    '酌情'
  ];

  const contractFiles = walkFiles(agentsDir, (filePath) => path.basename(filePath) === 'contract.json');
  if (!contractFiles.length) {
    pass('vague success criteria check: no contract.json to scan');
    return;
  }

  const hits = [];
  let scanned = 0;
  for (const filePath of contractFiles) {
    let contract;
    try {
      contract = JSON.parse(readFile(filePath));
    } catch {
      continue;
    }
    const criteria = Array.isArray(contract.success_criteria) ? contract.success_criteria : [];
    for (const item of criteria) {
      scanned += 1;
      const text = `${item.description || ''} ${item.title || ''}`;
      for (const pattern of vaguePatterns) {
        if (text.includes(pattern)) {
          hits.push(`${relative(filePath)} -> "${item.id || item.description || '(criterion)'}" 含模糊词 "${pattern}"`);
        }
      }
    }
  }

  if (hits.length) {
    fail(`success criteria 含不可验证的模糊目标(应转为可观察标准或移入非阻塞 notes):\n${hits.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`success criteria are observable (${scanned} criteria across ${contractFiles.length} contract.json)`);
}

// 可执行兜底:把 HARNESS_CORE_SPEC「run.json 唯一事实源」与「fail MUST NOT 关闭」从规则变为强制检查。
function checkRunArtifacts() {
  const runsDir = resolveInAgents('project/harness/runs');
  if (!fs.existsSync(runsDir)) {
    pass('run artifacts check: no runs directory to scan');
    return;
  }

  const runDirs = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '.DS_Store')
    .map((entry) => path.join(runsDir, entry.name));

  if (!runDirs.length) {
    pass('run artifacts check: runs directory empty');
    return;
  }

  const issues = [];
  for (const dir of runDirs) {
    const runJsonPath = path.join(dir, 'run.json');
    if (!fs.existsSync(runJsonPath)) {
      issues.push(`${relative(dir)} 缺少 run.json(唯一机器可读事实源)`);
      continue;
    }
    let run;
    try {
      run = JSON.parse(readFile(runJsonPath));
    } catch (error) {
      issues.push(`${relative(runJsonPath)} 无法解析: ${error.message}`);
      continue;
    }
    if (run.status === 'closed' && run.evaluator?.decision === 'fail') {
      issues.push(`${relative(runJsonPath)} 以 fail 关闭(spec: fail MUST NOT 关闭)`);
    }
    if (run.status === 'closed' && run.evaluator?.decision === 'pass') {
      const unsatisfiedGates = (run.quality_gates || [])
        .filter((gate) => gate.required !== false)
        .filter((gate) => gate.status !== 'passed' || !(gate.evidence || []).length);
      if (unsatisfiedGates.length) {
        issues.push(`${relative(runJsonPath)} pass 关闭但 QA gate 未满足: ${unsatisfiedGates.map((gate) => `${gate.id}:${gate.status || 'pending'}`).join(', ')}`);
      }
    }
  }

  if (issues.length) {
    fail(`run 产物违反 Harness Core 约束:\n${issues.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass(`run artifacts valid (${runDirs.length} run(s))`);
}

function checkProjectGraphArtifacts() {
  if (templateMode) {
    pass('project graph artifacts check skipped in template mode');
    return;
  }

  const requiredGraphFiles = [
    'project/graph/codegraph-status.md',
    'project/graph/codegraph-snapshot.md',
    'project/graph/project-code-graph.md',
    'project/graph/project-code-graph.json',
    'project/graph/business-knowledge.md'
  ];
  const missing = requiredGraphFiles.filter((relPath) => !exists(relPath));
  if (missing.length) {
    warn(`project graph artifacts missing; run scripts/agent-project-profile.mjs --write or scripts/agent-project-graph.mjs --write:\n${missing.map((item) => `  - ${item}`).join('\n')}`);
    return;
  }

  pass('project graph artifacts present');
}

function loadForbiddenCorePatterns() {
  const configPath = resolveInAgents('project/agent-verify.config.json');
  if (!fs.existsSync(configPath)) return [];

  try {
    const config = JSON.parse(readFile(configPath));
    return Array.isArray(config.forbidden_core_patterns)
      ? config.forbidden_core_patterns.map(String)
      : [];
  } catch (error) {
    fail(`cannot parse project/agent-verify.config.json: ${error.message}`);
    return [];
  }
}

function resolveContractPath(value) {
  if (path.isAbsolute(value)) return value;
  const normalized = value.replace(/^\.agents\//, '');
  const candidates = [
    path.resolve(agentsDir, normalized),
    path.resolve(agentsDir, value),
    path.resolve(realAgentsDir(), normalized),
    path.resolve(realAgentsDir(), value),
    path.resolve(process.cwd(), value)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function realAgentsDir() {
  try {
    return fs.realpathSync(agentsDir);
  } catch {
    return agentsDir;
  }
}

function walkFiles(startDir, predicate = () => true) {
  const files = [];
  if (!fs.existsSync(startDir)) return files;

  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const filePath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath, predicate));
    } else if (entry.isFile() && predicate(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

    const key = item.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith('--') ? next : true;
    if (value !== true) index += 1;

    if (parsed[key] === undefined) parsed[key] = value;
    else if (Array.isArray(parsed[key])) parsed[key].push(value);
    else parsed[key] = [parsed[key], value];
  }
  return parsed;
}

function getArg(name, fallback) {
  const value = args[name];
  if (Array.isArray(value)) return value[value.length - 1];
  return value === undefined || value === true ? fallback : value;
}

function getRepeatedArg(name) {
  const value = args[name];
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function exists(relPath) {
  return fs.existsSync(resolveInAgents(relPath));
}

function readRel(relPath) {
  return readFile(resolveInAgents(relPath));
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function resolveInAgents(relPath) {
  return path.resolve(agentsDir, relPath);
}

function relative(filePath) {
  return path.relative(agentsDir, filePath) || '.';
}

function pass(message) {
  passes.push(message);
}

function warn(message) {
  warnings.push(message);
}

function fail(message) {
  errors.push(message);
}

function finish() {
  console.log(`Agent harness verify: ${agentsDir}`);

  for (const message of passes) console.log(`[pass] ${message}`);
  for (const message of warnings) console.warn(`[warn] ${message}`);
  for (const message of errors) console.error(`[fail] ${message}`);

  if (errors.length) {
    console.error(`Failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log('Agent harness verify passed.');
}
