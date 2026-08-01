#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'help';
const projectRoot = canonicalPath(getArg('project-root', process.cwd()));
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const runsDir = path.join(agentsDir, 'project/runs');
const locksPath = path.join(agentsDir, 'project/agentctl-locks.json');

const workerPresets = {
  'codex-main': {
    agent: 'codex',
    role: 'complex-feature-developer',
    title: 'Codex complex feature developer',
    scope_paths: ['src/core/**', 'src/features/**', 'backend/**', 'packages/**'],
    description: '负责复杂功能、跨文件实现、核心逻辑改造和主要开发。'
  },
  'opencode-support': {
    agent: 'opencode',
    role: 'daily-feature-and-bugfix',
    title: 'OpenCode daily feature and bugfix developer',
    scope_paths: ['tests/**', 'docs/**', 'src/**/*.spec.*', 'src/**/*.test.*'],
    description: '负责日常功能、小修复、测试补齐、文档和低风险旁路任务。'
  },
  'antigravity-ui': {
    agent: 'antigravity',
    role: 'frontend-ui-builder',
    title: 'Antigravity frontend UI builder',
    scope_paths: ['src/pages/**', 'src/components/**', 'src/assets/**', 'styles/**', 'design/**'],
    description: '负责前端页面绘制、视觉实现、交互还原和设计类任务。'
  }
};

const reviewerPolicy = {
  claude: {
    agent: 'claude',
    role: 'planner-reviewer',
    description: 'Claude Code 负责规划、设计、风险审查和最终 review。'
  }
};

main();

function main() {
  try {
    if (command === 'help' || hasFlag('help') || hasFlag('h')) return printHelp();
    if (command === 'publish') return publish();
    if (command === 'dispatch') return dispatch();
    if (command === 'worker-run') return workerRun();
    if (command === 'collect') return collect();
    if (command === 'review') return review();
    if (command === 'cleanup') return cleanup();
    if (command === 'watch' || command === 'status') return watch();
    if (command === 'delegate') return delegate();
    if (command === 'metrics') return metricsCommand();
    if (command === 'list' || command === 'runs') return listRuns();
    if (command === 'latest') return latestRun();
    if (command === 'qa') return qa();
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    if (hasFlag('json')) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    } else {
      console.error(`agentctl: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

function publish() {
  ensureAgents();
  const task = getTask();
  const runId = sanitizeId(getArg('run-id', timestampId()));
  const runDir = path.join(runsDir, runId);
  if (fs.existsSync(runDir) && !hasFlag('overwrite')) {
    throw new Error(`run already exists: ${runId}`);
  }

  const requestedWorkers = csv(getArg('workers', ''));
  const isolationRequested = getArg('isolation', 'auto');
  const isolation = resolveIsolation(isolationRequested);
  const workers = buildWorkers(task, requestedWorkers, runId, runDir, isolation);
  const now = new Date().toISOString();
  const state = {
    schema_version: '1.0',
    run_id: runId,
    task,
    status: 'published',
    created_at: now,
    updated_at: now,
    project_root: projectRoot,
    agents_dir: agentsDir,
    run_dir: runDir,
    isolation,
    requested_isolation: isolationRequested,
    max_delegation_depth: Number(getArg('max-depth', 1)),
    orchestrator: getArg('orchestrator', detectCaller()),
    reviewer: reviewerPolicy.claude,
    workers,
    events: [],
    metrics: {
      token_estimates: estimateRunTokens(task, workers),
      elapsed_ms: null
    }
  };

  fs.mkdirSync(runDir, { recursive: true });
  for (const dir of ['work-orders', 'results', 'reviews', 'logs', 'patches', 'delegation-requests']) {
    fs.mkdirSync(path.join(runDir, dir), { recursive: true });
  }

  writeText(path.join(runDir, 'task-contract.md'), renderTaskContract(state));
  writeText(path.join(runDir, 'plan.md'), renderPlan(state));
  for (const worker of workers) {
    writeText(worker.work_order_path, renderWorkOrder(state, worker));
  }
  appendEvent(state, 'run.published', { workers: workers.map((worker) => worker.id), isolation });
  writeState(state);

  printResult({
    ok: true,
    action: 'publish',
    run_id: runId,
    run_dir: runDir,
    isolation,
    workers: workers.map((worker) => ({ id: worker.id, agent: worker.agent, status: worker.status })),
    next: `agentctl dispatch --run-id ${runId} --ghostty`
  }, renderPublishSummary);
}

function dispatch() {
  const state = loadState(requiredRunId());
  const selected = selectWorkers(state);
  const mode = getArg('mode', 'real');
  const execute = hasFlag('execute');
  const ghostty = hasFlag('ghostty');
  const dryRun = hasFlag('dry-run') || mode === 'dry-run';

  if (!dryRun) prepareWorkers(state, selected);
  for (const worker of selected) {
    worker.status = dryRun ? 'ready' : 'dispatched';
    worker.dispatch_command = buildWorkerRunCommand(state, worker, mode === 'dry-run' ? 'real' : mode);
    appendEvent(state, 'worker.dispatched', { worker_id: worker.id, agent: worker.agent, mode });
  }
  state.status = 'dispatched';
  touchState(state);
  writeState(state);

  if (ghostty) {
    const script = renderGhosttyScript(state, selected, mode === 'dry-run' ? 'real' : mode);
    const scriptPath = path.join(state.run_dir, 'ghostty-layout.applescript');
    writeText(scriptPath, script);
    if (!dryRun) {
      const result = spawnSync('osascript', [scriptPath], { cwd: projectRoot, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Ghostty AppleScript failed: ${result.stderr || result.stdout}`);
    }
    return printResult({
      ok: true,
      action: 'dispatch',
      run_id: state.run_id,
      mode,
      ghostty_script: scriptPath,
      executed: !dryRun,
      commands: selected.map((worker) => ({ worker_id: worker.id, command: worker.dispatch_command }))
    }, renderDispatchSummary);
  }

  if (execute && !dryRun) {
    const startedAt = Date.now();
    const results = selected.map((worker) => runWorkerSync(state, worker, mode));
    const latest = loadState(state.run_id);
    latest.metrics ||= {};
    latest.metrics.elapsed_ms = Date.now() - startedAt;
    latest.status = results.every((item) => item.status === 0) ? 'workers-completed' : 'workers-failed';
    touchState(latest);
    writeState(latest);
    return printResult({
      ok: results.every((item) => item.status === 0),
      action: 'dispatch',
      run_id: state.run_id,
      mode,
      executed: true,
      results
    }, renderDispatchSummary);
  }

  printResult({
    ok: true,
    action: 'dispatch',
    run_id: state.run_id,
    mode,
    executed: false,
    commands: selected.map((worker) => ({ worker_id: worker.id, command: worker.dispatch_command }))
  }, renderDispatchSummary);
}

function workerRun() {
  const state = loadState(requiredRunId());
  const workerId = getArg('worker', getArg('worker-id', ''));
  if (!workerId) throw new Error('--worker is required');
  const worker = state.workers.find((item) => item.id === workerId);
  if (!worker) throw new Error(`worker not found: ${workerId}`);
  const mode = getArg('mode', 'real');
  const startedAt = Date.now();
  worker.status = 'running';
  worker.started_at = new Date().toISOString();
  appendEvent(state, 'worker.started', { worker_id: worker.id, agent: worker.agent, mode });
  writeState(state);

  try {
    if (mode === 'mock') {
      const sleepMs = Number(getArg('sleep-ms', 80));
      sleep(sleepMs);
      writeMockResult(state, worker, sleepMs);
      finishWorker(state, worker, startedAt, 'done', 0);
      return printResult({ ok: true, worker_id: worker.id, mode, result_path: worker.result_path }, renderWorkerRunSummary);
    }

    const runResult = runRealAgent(state, worker);
    if (runResult.status === 0) {
      finishWorker(state, worker, startedAt, 'done', 0);
    } else {
      finishWorker(state, worker, startedAt, 'failed', runResult.status);
    }
    printResult({
      ok: runResult.status === 0,
      worker_id: worker.id,
      mode,
      exit_code: runResult.status,
      result_path: worker.result_path,
      log_path: worker.log_path
    }, renderWorkerRunSummary);
  } catch (error) {
    worker.error = error.message;
    finishWorker(state, worker, startedAt, 'failed', 1);
    throw error;
  }
}

function collect() {
  const state = loadState(requiredRunId());
  const selected = selectWorkers(state);
  const collected = [];
  const missing = [];
  const patches = [];

  for (const worker of selected) {
    const resultExists = fs.existsSync(worker.result_path);
    if (!resultExists) {
      worker.status = worker.status === 'pending' ? 'pending' : 'missing-result';
      missing.push(worker.id);
      continue;
    }
    const parsed = parseResult(readText(worker.result_path));
    worker.result_status = parsed.status;
    worker.changed_files = parsed.changed_files;
    worker.validation = parsed.validation;
    if (worker.worktree_path && fs.existsSync(worker.worktree_path) && isGitProject(projectRoot)) {
      const patchPath = path.join(state.run_dir, 'patches', `${worker.id}.patch`);
      const patch = git(['-C', worker.worktree_path, 'diff', '--binary', 'HEAD'], { allowFailure: true }).stdout;
      writeText(patchPath, patch);
      worker.patch_path = patchPath;
      if (patch.trim()) patches.push({ worker_id: worker.id, patch_path: patchPath });
    }
    collected.push(worker.id);
  }

  const report = renderCollectReport(state, collected, missing, patches);
  const reportPath = path.join(state.run_dir, 'collector-report.md');
  writeText(reportPath, report);
  state.collector_report_path = reportPath;
  state.status = missing.length ? 'collect-incomplete' : 'collected';
  appendEvent(state, 'run.collected', { collected, missing, patches: patches.length });
  touchState(state);
  writeState(state);

  printResult({
    ok: missing.length === 0,
    action: 'collect',
    run_id: state.run_id,
    collected,
    missing,
    patches,
    report_path: reportPath
  }, renderCollectSummary);
}

function review() {
  const state = loadState(requiredRunId());
  const mode = getArg('mode', 'rule');
  const reviewPath = path.join(state.run_dir, 'reviews', `review-${new Date().toISOString().replaceAll(':', '')}.md`);
  const ruleDecision = ruleReview(state);

  if (mode === 'real') {
    const prompt = renderReviewPrompt(state, ruleDecision);
    const result = runClaudeReview(prompt);
    writeText(reviewPath, result.text);
    state.review = {
      mode,
      decision: result.status === 0 && ruleDecision.decision === 'PASS' ? 'PASS' : 'REWORK',
      report_path: reviewPath,
      exit_code: result.status
    };
  } else {
    writeText(reviewPath, renderRuleReview(state, ruleDecision));
    state.review = {
      mode,
      decision: ruleDecision.decision,
      report_path: reviewPath,
      exit_code: ruleDecision.decision === 'PASS' ? 0 : 1
    };
  }

  state.status = state.review.decision === 'PASS' ? 'reviewed' : 'needs-rework';
  appendEvent(state, 'run.reviewed', { decision: state.review.decision, mode });
  touchState(state);
  writeState(state);
  printResult({
    ok: state.review.decision === 'PASS',
    action: 'review',
    run_id: state.run_id,
    decision: state.review.decision,
    report_path: reviewPath
  }, renderReviewSummary);
}

function cleanup() {
  const state = loadState(requiredRunId());
  const dryRun = hasFlag('dry-run');
  const removed = [];
  const skipped = [];
  for (const worker of state.workers) {
    if (!worker.worktree_path) continue;
    if (!fs.existsSync(worker.worktree_path)) {
      skipped.push(worker.worktree_path);
      continue;
    }
    if (!dryRun) removeWorktree(worker.worktree_path);
    removed.push(worker.worktree_path);
  }
  if (!dryRun) releaseRunLocks(state.run_id);
  if (!dryRun) {
    state.status = 'cleaned';
    state.cleaned_at = new Date().toISOString();
    appendEvent(state, 'run.cleaned', { removed: removed.length });
    touchState(state);
    writeState(state);
  }
  printResult({
    ok: true,
    action: 'cleanup',
    run_id: state.run_id,
    dry_run: dryRun,
    removed,
    skipped
  }, renderCleanupSummary);
}

function watch() {
  const state = loadState(requiredRunId());
  printResult({
    ok: true,
    action: 'watch',
    run_id: state.run_id,
    status: state.status,
    isolation: state.isolation,
    workers: state.workers.map((worker) => ({
      id: worker.id,
      agent: worker.agent,
      status: worker.status,
      elapsed_ms: worker.elapsed_ms || null,
      result: fs.existsSync(worker.result_path) ? worker.result_path : null
    })),
    review: state.review || null
  }, renderWatchSummary);
}

function delegate() {
  const state = loadState(requiredRunId());
  const fromWorker = getArg('from-worker', '');
  const to = getArg('to', '');
  const task = getTask();
  if (!fromWorker) throw new Error('--from-worker is required');
  if (!to) throw new Error('--to is required');
  const parent = state.workers.find((worker) => worker.id === fromWorker);
  if (!parent) throw new Error(`from worker not found: ${fromWorker}`);
  const depth = Number(parent.delegation_depth || 0) + 1;
  if (depth > Number(state.max_delegation_depth || 1)) {
    throw new Error(`delegation depth ${depth} exceeds max ${state.max_delegation_depth}`);
  }
  const workerId = uniqueWorkerId(state, to);
  const preset = presetFor(to);
  const worker = createWorker({
    id: workerId,
    preset,
    runId: state.run_id,
    runDir: state.run_dir,
    task,
    isolation: state.isolation,
    parent_worker: fromWorker,
    delegation_depth: depth,
    scope_paths: csv(getArg('paths', '')).length ? csv(getArg('paths', '')) : preset.scope_paths
  });
  state.workers.push(worker);
  writeText(worker.work_order_path, renderWorkOrder(state, worker));
  const requestPath = path.join(state.run_dir, 'delegation-requests', `${worker.id}.json`);
  writeJson(requestPath, {
    run_id: state.run_id,
    from_worker: fromWorker,
    worker_id: worker.id,
    to,
    task,
    scope_paths: worker.scope_paths,
    created_at: new Date().toISOString()
  });
  appendEvent(state, 'worker.delegated', { from_worker: fromWorker, worker_id: worker.id, to });
  touchState(state);
  writeState(state);
  printResult({
    ok: true,
    action: 'delegate',
    run_id: state.run_id,
    worker_id: worker.id,
    work_order_path: worker.work_order_path
  }, renderDelegateSummary);
}

function metricsCommand() {
  const state = loadState(requiredRunId());
  const metrics = buildMetrics(state);
  const outPath = path.join(state.run_dir, 'metrics.md');
  writeText(outPath, renderMetrics(state, metrics));
  state.metrics = { ...(state.metrics || {}), ...metrics, report_path: outPath };
  touchState(state);
  writeState(state);
  printResult({
    ok: true,
    action: 'metrics',
    run_id: state.run_id,
    report_path: outPath,
    metrics
  }, renderMetricsSummary);
}

function qa() {
  const startedAt = Date.now();
  const runId = sanitizeId(getArg('run-id', `qa-${timestampId()}`));
  const task = getArg('task', 'QA 验证：发布一个多 Agent 示例任务，Codex 负责复杂逻辑，OpenCode 负责测试和文档，Antigravity 负责前端 UI 验证工单。');
  runInternal(['publish', '--run-id', runId, '--task', task, '--workers', 'codex-main,opencode-support,antigravity-ui', '--isolation', 'lock', '--project-root', projectRoot]);
  runInternal(['dispatch', '--run-id', runId, '--mode', 'mock', '--execute', '--project-root', projectRoot]);
  runInternal(['collect', '--run-id', runId, '--project-root', projectRoot]);
  runInternal(['review', '--run-id', runId, '--mode', 'rule', '--project-root', projectRoot]);
  runInternal(['metrics', '--run-id', runId, '--project-root', projectRoot]);
  runInternal(['cleanup', '--run-id', runId, '--project-root', projectRoot]);
  const state = loadState(runId);
  const elapsedMs = Date.now() - startedAt;
  const qaReportPath = path.join(state.run_dir, 'qa-report.md');
  const report = renderQaReport(state, elapsedMs);
  writeText(qaReportPath, report);
  state.qa_report_path = qaReportPath;
  state.qa_elapsed_ms = elapsedMs;
  touchState(state);
  writeState(state);
  printResult({
    ok: state.review?.decision === 'PASS',
    action: 'qa',
    run_id: runId,
    elapsed_ms: elapsedMs,
    qa_report_path: qaReportPath,
    review_decision: state.review?.decision,
    metrics: state.metrics
  }, renderQaSummary);
}

function listRuns() {
  ensureAgents();
  const limit = Number(getArg('limit', '10'));
  const runs = getRuns().slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10);
  printResult({
    ok: true,
    action: 'list',
    project_root: projectRoot,
    runs
  }, renderListSummary);
}

function latestRun() {
  ensureAgents();
  const latest = getRuns()[0] || null;
  printResult({
    ok: Boolean(latest),
    action: 'latest',
    project_root: projectRoot,
    run: latest
  }, renderLatestSummary);
}

function buildWorkers(task, requestedWorkers, runId, runDir, isolation) {
  const inferred = requestedWorkers.length ? requestedWorkers : inferWorkers(task);
  return inferred.map((name) => {
    const preset = presetFor(name);
    return createWorker({
      id: preset.id || name,
      preset,
      runId,
      runDir,
      task,
      isolation,
      scope_paths: preset.scope_paths
    });
  });
}

function createWorker({ id, preset, runId, runDir, task, isolation, parent_worker = null, delegation_depth = 0, scope_paths }) {
  const safeId = sanitizeId(id);
  const workOrderPath = path.join(runDir, 'work-orders', `${safeId}.md`);
  const resultPath = path.join(runDir, 'results', `${safeId}.result.md`);
  const logPath = path.join(runDir, 'logs', `${safeId}.jsonl`);
  return {
    id: safeId,
    agent: preset.agent,
    role: preset.role,
    title: preset.title,
    description: preset.description,
    status: 'pending',
    parent_worker,
    delegation_depth,
    scope_paths: [...scope_paths],
    work_order_path: workOrderPath,
    result_path: resultPath,
    log_path: logPath,
    token_estimate: estimateTokens([task, preset.description, scope_paths.join('\n')].join('\n')),
    isolation
  };
}

function inferWorkers(task) {
  const text = task.toLowerCase();
  const workers = [];
  const hasUi = containsAny(text, ['前端', '页面', '绘制', 'ui', '视觉', '设计', '样式', '交互', '大屏']);
  const hasBugOrDaily = containsAny(text, ['bug', '修复', '日常', '小任务', '测试', '文档', '副手']);
  const hasComplex = containsAny(text, ['复杂', '核心', '跨', '架构', '工程化', '自动化', '调度', '多 agent', '多agent', '长程', '功能开发']);

  if (hasUi && !hasComplex) workers.push('antigravity-ui');
  if (hasComplex || (!hasUi && !hasBugOrDaily)) workers.push('codex-main');
  if (hasBugOrDaily) workers.push('opencode-support');
  if (hasUi && hasComplex) workers.push('antigravity-ui');
  return workers.length ? dedupe(workers) : ['codex-main'];
}

function prepareWorkers(state, workers) {
  if (state.isolation === 'worktree') {
    if (!isGitProject(projectRoot)) {
      state.isolation = 'lock';
      appendEvent(state, 'isolation.fallback', { from: 'worktree', to: 'lock', reason: 'not a git project' });
      prepareLocks(state, workers);
      return;
    }
    for (const worker of workers) prepareWorktree(state, worker);
    return;
  }
  if (state.isolation === 'lock') prepareLocks(state, workers);
}

function prepareWorktree(state, worker) {
  if (worker.worktree_path && fs.existsSync(worker.worktree_path)) return;
  const baseDir = path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}.agent-worktrees`, state.run_id);
  const worktreePath = path.join(baseDir, worker.id);
  const branch = `agent/${state.run_id}/${worker.id}`.replaceAll(/[^a-zA-Z0-9/_-]/g, '-');
  fs.mkdirSync(baseDir, { recursive: true });
  const result = git(['worktree', 'add', '-B', branch, worktreePath, 'HEAD'], { allowFailure: true });
  if (result.status !== 0) throw new Error(`git worktree add failed for ${worker.id}: ${result.stderr || result.stdout}`);
  worker.worktree_path = worktreePath;
  worker.branch = branch;
  worker.workdir = worktreePath;
}

function prepareLocks(state, workers) {
  const locks = readLocks();
  for (const worker of workers) {
    for (const scopePath of worker.scope_paths) {
      const existing = locks.locks[scopePath];
      if (existing && existing.run_id !== state.run_id) {
        throw new Error(`path lock conflict: ${scopePath} held by ${existing.run_id}/${existing.worker_id}`);
      }
    }
  }
  const now = new Date().toISOString();
  for (const worker of workers) {
    worker.workdir = projectRoot;
    for (const scopePath of worker.scope_paths) {
      locks.locks[scopePath] = {
        run_id: state.run_id,
        worker_id: worker.id,
        acquired_at: now
      };
    }
  }
  writeLocks(locks);
}

function runRealAgent(state, worker) {
  const workOrder = readText(worker.work_order_path);
  fs.mkdirSync(path.dirname(worker.log_path), { recursive: true });
  fs.mkdirSync(path.dirname(worker.result_path), { recursive: true });
  const workdir = worker.workdir || projectRoot;
  const startedAt = Date.now();
  let result;

  if (worker.agent === 'codex') {
    const commandLine = getAgentCommand('AGENTCTL_CODEX_CMD', 'codex', ['exec', '-C', workdir, '--json', '-o', worker.result_path, '-'], workdir, worker.result_path);
    result = spawnSync(commandLine.shell, commandLine.args, {
      cwd: workdir,
      input: workOrder,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    });
  } else if (worker.agent === 'claude') {
    const commandLine = getAgentCommand('AGENTCTL_CLAUDE_CMD', 'claude', ['-p', '--output-format', 'json'], workdir, worker.result_path);
    result = spawnSync(commandLine.shell, commandLine.args, {
      cwd: workdir,
      input: workOrder,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    });
    const text = extractClaudeResult(result.stdout) || result.stdout || result.stderr;
    writeText(worker.result_path, normalizeResultText(worker, text, result.status));
  } else if (worker.agent === 'opencode') {
    const commandLine = getAgentCommand('AGENTCTL_OPENCODE_CMD', 'opencode', ['run', '--dir', workdir, '--format', 'json'], workdir, worker.result_path);
    result = spawnSync(commandLine.shell, commandLine.args, {
      cwd: workdir,
      input: workOrder,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    });
    if (!process.env.AGENTCTL_OPENCODE_CMD && result.status !== 0 && String(result.stderr || '').includes('provide a message')) {
      result = spawnSync('opencode', ['run', '--dir', workdir, '--format', 'json', workOrder], {
        cwd: workdir,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 20
      });
    }
    writeText(worker.result_path, normalizeResultText(worker, extractOpenCodeResult(result.stdout) || result.stdout || result.stderr, result.status));
  } else if (worker.agent === 'antigravity') {
    const commandLine = getAntigravityCommand(worker, workdir, worker.result_path);
    if (!commandLine) throw new Error('Antigravity CLI command not found. Set AGENTCTL_ANTIGRAVITY_CMD.');
    result = spawnSync(commandLine.shell, commandLine.args, {
      cwd: workdir,
      input: workOrder,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    });
    writeText(worker.result_path, normalizeResultText(worker, result.stdout || result.stderr, result.status));
  } else {
    throw new Error(`unsupported agent: ${worker.agent}`);
  }

  const logRecord = {
    worker_id: worker.id,
    agent: worker.agent,
    status: result.status,
    elapsed_ms: Date.now() - startedAt,
    stdout: truncate(result.stdout || '', 120000),
    stderr: truncate(result.stderr || '', 120000)
  };
  writeText(worker.log_path, `${JSON.stringify(logRecord)}\n`);
  if (!fs.existsSync(worker.result_path)) {
    writeText(worker.result_path, normalizeResultText(worker, result.stdout || result.stderr || '', result.status));
  }
  return { status: result.status || 0 };
}

function writeMockResult(state, worker, sleepMs) {
  const changedFile = `.agents/project/runs/${state.run_id}/mock/${worker.id}.txt`;
  const result = [
    '# Agent Result',
    '',
    `- status: done`,
    `- worker_id: ${worker.id}`,
    `- agent: ${worker.agent}`,
    `- changed_files: ${changedFile}`,
    `- validation: mock validation passed in ${sleepMs}ms`,
    '- evidence: agentctl qa mock run',
    '- risks: none for mock validation',
    '- next_steps: ready for collector review',
    '',
    '## Summary',
    '',
    `${worker.title} completed the assigned work order in mock mode.`,
    ''
  ].join('\n');
  writeText(worker.result_path, result);
  writeText(worker.log_path, `${JSON.stringify({ worker_id: worker.id, mode: 'mock', elapsed_ms: sleepMs, status: 0 })}\n`);
}

function finishWorker(state, worker, startedAt, status, exitCode) {
  worker.status = status;
  worker.exit_code = exitCode;
  worker.finished_at = new Date().toISOString();
  worker.elapsed_ms = Date.now() - startedAt;
  appendEvent(state, 'worker.finished', { worker_id: worker.id, status, exit_code: exitCode, elapsed_ms: worker.elapsed_ms });
  touchState(state);
  writeState(state);
}

function buildWorkerRunCommand(state, worker, mode) {
  return [
    shellQuote(resolveAgentctlPath()),
    'worker-run',
    '--project-root',
    shellQuote(projectRoot),
    '--run-id',
    shellQuote(state.run_id),
    '--worker',
    shellQuote(worker.id),
    '--mode',
    shellQuote(mode)
  ].join(' ');
}

function renderTaskContract(state) {
  return [
    '# Multi-Agent Task Contract',
    '',
    `- run_id: ${state.run_id}`,
    `- status: ${state.status}`,
    `- isolation: ${state.isolation}`,
    `- orchestrator: ${state.orchestrator}`,
    '',
    '## Task',
    '',
    state.task,
    '',
    '## Role Policy',
    '',
    '- Claude Code: planning, design review, final review.',
    '- Codex: complex feature implementation and main development.',
    '- OpenCode: daily features, bug fixes, tests, docs, and support work.',
    '- Antigravity: frontend page drawing, visual implementation, interaction and design tasks.',
    '',
    '## Concurrency Policy',
    '',
    '- Agents do not call each other directly.',
    '- Agents may only request more work with `agentctl delegate`.',
    '- `worktree` isolation is preferred in Git projects.',
    '- `lock` isolation is used when Git worktree is unavailable.',
    '- Workers must stay inside their assigned scope paths.',
    '',
    '## Success Criteria',
    '',
    '- All worker result files exist.',
    '- Collector report has no missing workers.',
    '- Review decision is PASS.',
    '- Worktrees or locks can be cleaned with `agentctl cleanup --run-id ' + state.run_id + '`.',
    ''
  ].join('\n');
}

function renderPlan(state) {
  const lines = ['# Multi-Agent Plan', ''];
  lines.push('## Workers', '');
  for (const worker of state.workers) {
    lines.push(`- ${worker.id} (${worker.agent}): ${worker.description}`);
    lines.push(`  scope: ${worker.scope_paths.join(', ')}`);
  }
  lines.push('', '## Lifecycle', '');
  lines.push('1. `agentctl dispatch --run-id ' + state.run_id + ' --ghostty`');
  lines.push('2. `agentctl collect --run-id ' + state.run_id + '`');
  lines.push('3. `agentctl review --run-id ' + state.run_id + '`');
  lines.push('4. `agentctl cleanup --run-id ' + state.run_id + '`');
  lines.push('');
  return lines.join('\n');
}

function renderWorkOrder(state, worker) {
  return [
    '---',
    `run_id: ${state.run_id}`,
    `worker_id: ${worker.id}`,
    `agent: ${worker.agent}`,
    `role: ${worker.role}`,
    `isolation: ${state.isolation}`,
    `result_path: ${worker.result_path}`,
    `log_path: ${worker.log_path}`,
    '---',
    '',
    `# Work Order: ${worker.title}`,
    '',
    '## User Task',
    '',
    state.task,
    '',
    '## Your Responsibility',
    '',
    worker.description,
    '',
    '## Scope Paths',
    '',
    ...worker.scope_paths.map((item) => `- ${item}`),
    '',
    '## Rules',
    '',
    '- Do not edit outside Scope Paths unless you first request delegation.',
    '- Do not start another Agent directly.',
    '- If you need another Agent, run `agentctl delegate` with a focused request.',
    '- Keep changes minimal and reviewable.',
    '- Record validation evidence.',
    '',
    '## Required Result Contract',
    '',
    `Write or return a result that can be saved to: ${worker.result_path}`,
    '',
    'Use this shape:',
    '',
    '```text',
    '# Agent Result',
    '',
    '- status: done / blocked / failed',
    '- worker_id: ' + worker.id,
    '- agent: ' + worker.agent,
    '- changed_files:',
    '- validation:',
    '- evidence:',
    '- risks:',
    '- next_steps:',
    '```',
    ''
  ].join('\n');
}

function renderGhosttyScript(state, workers, mode) {
  const commands = workers.map((worker) => buildWorkerRunCommand(state, worker, mode));
  const labels = workers.map((worker) => `${worker.id} (${worker.agent})`);
  const projectDir = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
  const firstCommand = `printf '%s\\n' ${shellQuote(`[agentctl] ${labels[0] || 'watch'}`)}; ${commands[0] || `agentctl watch --run-id ${state.run_id}`}`;
  const secondCommand = commands[1] || `agentctl watch --run-id ${state.run_id}`;
  const thirdCommand = commands[2] || `agentctl watch --run-id ${state.run_id}`;
  const watchCommand = `${resolveAgentctlPath()} watch --project-root ${shellQuote(projectRoot)} --run-id ${shellQuote(state.run_id)}`;
  return [
    `set projectDir to ${applescriptString(projectDir)}`,
    '',
    'tell application "Ghostty"',
    '    activate',
    '    set cfg to new surface configuration',
    '    set initial working directory of cfg to projectDir',
    '    set win to new window with configuration cfg',
    '    set paneOne to terminal 1 of selected tab of win',
    '    set paneTwo to split paneOne direction right with configuration cfg',
    '    set paneThree to split paneOne direction down with configuration cfg',
    '    set paneWatch to split paneTwo direction down with configuration cfg',
    `    input text ${applescriptString(firstCommand)} to paneOne`,
    '    send key "enter" to paneOne',
    `    input text ${applescriptString(secondCommand)} to paneTwo`,
    '    send key "enter" to paneTwo',
    `    input text ${applescriptString(thirdCommand)} to paneThree`,
    '    send key "enter" to paneThree',
    `    input text ${applescriptString(watchCommand)} to paneWatch`,
    '    send key "enter" to paneWatch',
    '    focus paneWatch',
    'end tell',
    ''
  ].join('\n');
}

function renderCollectReport(state, collected, missing, patches) {
  const lines = ['# Collector Report', '', `- run_id: ${state.run_id}`, `- collected: ${collected.length}`, `- missing: ${missing.length}`, ''];
  lines.push('## Worker Results', '');
  for (const worker of state.workers) {
    lines.push(`- ${worker.id}: ${worker.result_status || worker.status}`);
    if (worker.changed_files?.length) lines.push(`  changed_files: ${worker.changed_files.join(', ')}`);
    if (worker.validation?.length) lines.push(`  validation: ${worker.validation.join('; ')}`);
  }
  if (missing.length) {
    lines.push('', '## Missing Results', '');
    for (const workerId of missing) lines.push(`- ${workerId}`);
  }
  if (patches.length) {
    lines.push('', '## Patches', '');
    for (const patch of patches) lines.push(`- ${patch.worker_id}: ${patch.patch_path}`);
  }
  lines.push('');
  return lines.join('\n');
}

function ruleReview(state) {
  const findings = [];
  for (const worker of state.workers) {
    if (!fs.existsSync(worker.result_path)) findings.push(`[P1] missing result for ${worker.id}`);
    if (worker.status !== 'done' && worker.result_status !== 'done') findings.push(`[P1] worker not done: ${worker.id} (${worker.status})`);
  }
  const overlaps = findScopeOverlaps(state.workers);
  for (const overlap of overlaps) {
    findings.push(`[P2] possible scope overlap: ${overlap.a} <-> ${overlap.b} (${overlap.path})`);
  }
  if (state.status === 'collect-incomplete') findings.push('[P1] collector marked run incomplete');
  const blocking = findings.filter((item) => item.startsWith('[P1]'));
  return {
    decision: blocking.length ? 'REWORK' : 'PASS',
    findings
  };
}

function renderReviewPrompt(state, ruleDecision) {
  return [
    'Review this multi-agent run. Act as Claude Code planner/reviewer.',
    '',
    readText(path.join(state.run_dir, 'task-contract.md')),
    '',
    readText(state.collector_report_path || path.join(state.run_dir, 'collector-report.md')),
    '',
    'Rule review precheck:',
    JSON.stringify(ruleDecision, null, 2),
    '',
    'Return PASS or REWORK with concise findings.'
  ].join('\n');
}

function renderRuleReview(state, decision) {
  const lines = ['# Rule Review', '', `- run_id: ${state.run_id}`, `- decision: ${decision.decision}`, ''];
  lines.push('## Findings', '');
  if (decision.findings.length) {
    for (const finding of decision.findings) lines.push(`- ${finding}`);
  } else {
    lines.push('- none');
  }
  lines.push('', '## Review Policy', '');
  lines.push('- Author workers do not self-approve final completion.');
  lines.push('- This rule review checks completion evidence, missing results, and obvious scope overlap.');
  lines.push('');
  return lines.join('\n');
}

function renderMetrics(state, metrics) {
  return [
    '# Agentctl Metrics',
    '',
    `- run_id: ${state.run_id}`,
    `- observed_dispatch_elapsed_ms: ${metrics.observed_dispatch_elapsed_ms}`,
    `- parallel_elapsed_ms: ${metrics.parallel_elapsed_ms}`,
    `- sequential_elapsed_ms: ${metrics.sequential_elapsed_ms}`,
    `- time_saving_percent: ${formatPercent(metrics.time_saving_percent)}`,
    `- actual_model_tokens: ${metrics.actual_model_tokens}`,
    `- estimated_single_agent_tokens: ${metrics.estimated_single_agent_tokens}`,
    `- estimated_multi_agent_tokens: ${metrics.estimated_multi_agent_tokens}`,
    `- estimated_token_delta_percent: ${formatPercent(metrics.estimated_token_delta_percent)}`,
    '',
    '## Interpretation',
    '',
    '- observed_dispatch_elapsed_ms is the wall-clock time observed by agentctl when it directly executed workers.',
    '- parallel_elapsed_ms is estimated from the slowest worker, matching the Ghostty multi-pane parallel model.',
    '- actual_model_tokens is 0 when the run used mock mode or logs did not expose token usage.',
    '- estimated_token_delta_percent compares scoped work-order prompts with a single-agent baseline prompt.',
    '- negative token delta means the scoped multi-agent prompts are estimated cheaper than the baseline.',
    ''
  ].join('\n');
}

function renderQaReport(state, elapsedMs) {
  return [
    '# Agentctl QA Report',
    '',
    `- run_id: ${state.run_id}`,
    `- qa_elapsed_ms: ${elapsedMs}`,
    `- final_status: ${state.status}`,
    `- review_decision: ${state.review?.decision || 'missing'}`,
    `- isolation: ${state.isolation}`,
    '',
    '## Verified Flow',
    '',
    '- publish: generated task contract, plan, work orders, state file',
    '- dispatch: executed workers in mock mode through agentctl worker-run',
    '- collect: read worker results and generated collector report',
    '- review: rule review produced final decision',
    '- cleanup: released locks / worktree cleanup path executed',
    '- metrics: produced elapsed-time and token-estimate comparison',
    '',
    '## Metrics',
    '',
    readText(path.join(state.run_dir, 'metrics.md')),
    ''
  ].join('\n');
}

function buildMetrics(state) {
  const workerElapsed = state.workers.map((worker) => Number(worker.elapsed_ms || 0));
  const sequentialElapsed = workerElapsed.reduce((sum, item) => sum + item, 0);
  const observedDispatchElapsed = Number(state.metrics?.elapsed_ms || 0);
  const parallelElapsed = Math.max(...workerElapsed, 0) || observedDispatchElapsed;
  const actualTokens = readActualTokens(state);
  const estimatedSingle = estimateTokens([
    state.task,
    readIfExists(path.join(state.run_dir, 'task-contract.md')),
    readIfExists(path.join(state.run_dir, 'plan.md')),
    state.workers.map((worker) => readIfExists(worker.work_order_path)).join('\n\n'),
    'single agent must plan, implement, validate, review, and summarize all work'
  ].join('\n'));
  const estimatedMulti = state.workers.reduce((sum, worker) => sum + estimateTokens(readIfExists(worker.work_order_path)), 0)
    + estimateTokens(readIfExists(state.collector_report_path || path.join(state.run_dir, 'collector-report.md')))
    + estimateTokens('review the collected multi-agent results');
  return {
    parallel_elapsed_ms: parallelElapsed,
    observed_dispatch_elapsed_ms: observedDispatchElapsed,
    sequential_elapsed_ms: sequentialElapsed,
    time_saving_percent: sequentialElapsed ? ((sequentialElapsed - parallelElapsed) / sequentialElapsed) * 100 : 0,
    actual_model_tokens: actualTokens,
    estimated_single_agent_tokens: estimatedSingle,
    estimated_multi_agent_tokens: estimatedMulti,
    estimated_token_delta_percent: estimatedSingle ? ((estimatedMulti - estimatedSingle) / estimatedSingle) * 100 : 0
  };
}

function readActualTokens(state) {
  let total = 0;
  for (const worker of state.workers) {
    if (!fs.existsSync(worker.log_path)) continue;
    const text = readText(worker.log_path);
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        const usage = event.usage || event.msg?.usage || event.output?.usage;
        if (usage) {
          total += Number(usage.input_tokens || 0);
          total += Number(usage.output_tokens || 0);
          total += Number(usage.reasoning_output_tokens || 0);
        }
      } catch {}
    }
  }
  return total;
}

function runClaudeReview(prompt) {
  const result = spawnSync('claude', ['-p', '--output-format', 'json'], {
    cwd: projectRoot,
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });
  return {
    status: result.status || 0,
    text: extractClaudeResult(result.stdout) || result.stdout || result.stderr || ''
  };
}

function runWorkerSync(state, worker, mode) {
  const result = spawnSync(process.execPath, [
    resolveAgentctlPath(),
    'worker-run',
    '--project-root',
    projectRoot,
    '--run-id',
    state.run_id,
    '--worker',
    worker.id,
    '--mode',
    mode
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });
  return {
    worker_id: worker.id,
    status: result.status,
    stdout: truncate(result.stdout || '', 2000),
    stderr: truncate(result.stderr || '', 2000)
  };
}

function runInternal(argv) {
  const result = spawnSync(process.execPath, [resolveAgentctlPath(), ...argv, '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });
  if (result.status !== 0) {
    throw new Error(`internal agentctl ${argv[0]} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function loadState(runId) {
  const statePath = path.join(runsDir, runId, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error(`state not found for run: ${runId}`);
  return JSON.parse(readText(statePath));
}

function getRuns() {
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readRunSummary(entry.name))
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

function readRunSummary(runId) {
  const runDir = path.join(runsDir, runId);
  const statePath = path.join(runDir, 'state.json');
  const stat = fs.statSync(runDir);
  if (!fs.existsSync(statePath)) {
    return {
      run_id: runId,
      status: 'unknown',
      updated_at: stat.mtime.toISOString(),
      task: '',
      workers: [],
      run_dir: runDir
    };
  }
  try {
    const state = JSON.parse(readText(statePath));
    return {
      run_id: state.run_id || runId,
      status: state.status || 'unknown',
      isolation: state.isolation || '',
      updated_at: state.updated_at || stat.mtime.toISOString(),
      created_at: state.created_at || '',
      task: state.task || '',
      workers: (state.workers || []).map((worker) => ({
        id: worker.id,
        agent: worker.agent,
        status: worker.status
      })),
      run_dir: state.run_dir || runDir
    };
  } catch {
    return {
      run_id: runId,
      status: 'unreadable',
      updated_at: stat.mtime.toISOString(),
      task: '',
      workers: [],
      run_dir: runDir
    };
  }
}

function writeState(state) {
  fs.mkdirSync(state.run_dir, { recursive: true });
  writeJson(path.join(state.run_dir, 'state.json'), state);
}

function touchState(state) {
  state.updated_at = new Date().toISOString();
}

function appendEvent(state, type, data = {}) {
  const event = {
    type,
    run_id: state.run_id,
    at: new Date().toISOString(),
    ...data
  };
  state.events ||= [];
  state.events.push(event);
  if (state.run_dir) {
    fs.mkdirSync(state.run_dir, { recursive: true });
    fs.appendFileSync(path.join(state.run_dir, 'events.jsonl'), `${JSON.stringify(event)}\n`);
  }
}

function selectWorkers(state) {
  const workerArg = getArg('worker', getArg('workers', 'all'));
  if (!workerArg || workerArg === 'all') return state.workers;
  const wanted = csv(workerArg);
  const selected = state.workers.filter((worker) => wanted.includes(worker.id));
  if (selected.length !== wanted.length) {
    const found = new Set(selected.map((worker) => worker.id));
    throw new Error(`workers not found: ${wanted.filter((item) => !found.has(item)).join(', ')}`);
  }
  return selected;
}

function requiredRunId() {
  const runId = getArg('run-id', '');
  if (!runId) throw new Error('--run-id is required');
  return runId;
}

function getTask() {
  const task = getArg('task', '');
  const taskFile = getArg('task-file', '');
  if (task) return task;
  if (taskFile) return readText(path.resolve(taskFile)).trim();
  throw new Error('--task or --task-file is required');
}

function resolveIsolation(value) {
  if (value === 'auto') return isGitProject(projectRoot) ? 'worktree' : 'lock';
  if (!['worktree', 'lock', 'none'].includes(value)) throw new Error(`invalid isolation: ${value}`);
  if (value === 'worktree' && !isGitProject(projectRoot)) return 'lock';
  return value;
}

function isGitProject(root) {
  const result = git(['-C', root, 'rev-parse', '--show-toplevel'], { allowFailure: true });
  if (result.status !== 0) return false;
  return canonicalPath(result.stdout.trim()) === canonicalPath(root);
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function git(gitArgs, options = {}) {
  const result = spawnSync('git', gitArgs, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`git ${gitArgs.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function removeWorktree(worktreePath) {
  if (isGitProject(projectRoot)) {
    const result = git(['worktree', 'remove', '--force', worktreePath], { allowFailure: true });
    if (result.status === 0) return;
  }
  fs.rmSync(worktreePath, { recursive: true, force: true });
}

function readLocks() {
  if (!fs.existsSync(locksPath)) return { locks: {} };
  try {
    return JSON.parse(readText(locksPath));
  } catch {
    return { locks: {} };
  }
}

function writeLocks(locks) {
  writeJson(locksPath, locks);
}

function releaseRunLocks(runId) {
  const locks = readLocks();
  for (const [key, value] of Object.entries(locks.locks || {})) {
    if (value.run_id === runId) delete locks.locks[key];
  }
  writeLocks(locks);
}

function parseResult(text) {
  const lines = text.split('\n');
  const field = (name) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`- ${name}:`));
    return line ? line.split(':').slice(1).join(':').trim() : '';
  };
  return {
    status: field('status') || 'unknown',
    changed_files: splitField(field('changed_files')),
    validation: splitField(field('validation'))
  };
}

function splitField(value) {
  if (!value) return [];
  return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeResultText(worker, text, status) {
  if (text.includes('- status:')) return text;
  return [
    '# Agent Result',
    '',
    `- status: ${status === 0 ? 'done' : 'failed'}`,
    `- worker_id: ${worker.id}`,
    `- agent: ${worker.agent}`,
    '- changed_files:',
    '- validation:',
    '- evidence: CLI output captured by agentctl',
    `- risks: ${status === 0 ? 'not reported' : 'agent command failed'}`,
    '- next_steps:',
    '',
    '## Raw Output',
    '',
    '```text',
    truncate(text || '', 120000),
    '```',
    ''
  ].join('\n');
}

function extractClaudeResult(stdout) {
  if (!stdout) return '';
  try {
    const parsed = JSON.parse(stdout);
    return parsed.result || parsed.structured_output || stdout;
  } catch {
    return stdout;
  }
}

function extractOpenCodeResult(stdout) {
  if (!stdout) return '';
  const lines = stdout.split('\n').filter(Boolean);
  const text = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (typeof event.text === 'string') text.push(event.text);
      if (typeof event.message === 'string') text.push(event.message);
      if (typeof event.part?.text === 'string') text.push(event.part.text);
    } catch {}
  }
  return text.join('\n') || stdout;
}

function getAgentCommand(envName, fallbackShell, fallbackArgs, workdir, resultPath) {
  const configured = process.env[envName];
  if (!configured) return { shell: fallbackShell, args: fallbackArgs };
  return {
    shell: 'bash',
    args: ['-lc', expandCommandTemplate(configured, workdir, resultPath)]
  };
}

function getAntigravityCommand(worker, workdir, resultPath) {
  const configured = process.env.AGENTCTL_ANTIGRAVITY_CMD;
  if (configured) return { shell: 'bash', args: ['-lc', expandCommandTemplate(configured, workdir, resultPath)] };
  for (const bin of ['agy', 'antigravity', 'gemini']) {
    const check = spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
    if (check.status === 0) return { shell: bin, args: ['-p'] };
  }
  return null;
}

function expandCommandTemplate(template, workdir, resultPath) {
  return template
    .replaceAll('{workdir}', shellQuote(workdir))
    .replaceAll('{result}', shellQuote(resultPath));
}

function findScopeOverlaps(workers) {
  const overlaps = [];
  for (let i = 0; i < workers.length; i += 1) {
    for (let j = i + 1; j < workers.length; j += 1) {
      for (const left of workers[i].scope_paths || []) {
        for (const right of workers[j].scope_paths || []) {
          if (scopeMayOverlap(left, right)) overlaps.push({ a: workers[i].id, b: workers[j].id, path: `${left} ~ ${right}` });
        }
      }
    }
  }
  return overlaps;
}

function scopeMayOverlap(a, b) {
  const cleanA = a.replace(/\*\*?.*$/, '').replace(/\/$/, '');
  const cleanB = b.replace(/\*\*?.*$/, '').replace(/\/$/, '');
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB || cleanA.startsWith(`${cleanB}/`) || cleanB.startsWith(`${cleanA}/`);
}

function presetFor(name) {
  if (workerPresets[name]) return { id: name, ...workerPresets[name] };
  const aliases = {
    codex: 'codex-main',
    opencode: 'opencode-support',
    antigravity: 'antigravity-ui'
  };
  if (aliases[name] && workerPresets[aliases[name]]) return { id: aliases[name], ...workerPresets[aliases[name]] };
  throw new Error(`unknown worker preset: ${name}`);
}

function uniqueWorkerId(state, base) {
  const preset = presetFor(base);
  let id = preset.id || base;
  let index = 2;
  while (state.workers.some((worker) => worker.id === id)) {
    id = `${preset.id || base}-${index}`;
    index += 1;
  }
  return id;
}

function estimateRunTokens(task, workers) {
  const single_agent = estimateTokens([task, 'plan implement validate review summarize all work'].join('\n'));
  const multi_agent = workers.reduce((sum, worker) => sum + Number(worker.token_estimate || 0), 0);
  return {
    single_agent,
    multi_agent,
    delta_percent: single_agent ? ((multi_agent - single_agent) / single_agent) * 100 : 0
  };
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 3.8);
}

function printResult(data, renderer) {
  if (hasFlag('json')) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderer(data));
}

function renderPublishSummary(data) {
  return [
    `agentctl publish: ${data.run_id}`,
    `run_dir: ${data.run_dir}`,
    `isolation: ${data.isolation}`,
    `workers: ${data.workers.map((worker) => `${worker.id}/${worker.agent}`).join(', ')}`,
    `next: ${data.next}`,
    ''
  ].join('\n');
}

function renderDispatchSummary(data) {
  const lines = [`agentctl dispatch: ${data.run_id}`, `mode: ${data.mode}`, `executed: ${data.executed}`];
  if (data.ghostty_script) lines.push(`ghostty_script: ${data.ghostty_script}`);
  if (data.commands) {
    lines.push('commands:');
    for (const item of data.commands) lines.push(`- ${item.worker_id}: ${item.command}`);
  }
  if (data.results) {
    lines.push('results:');
    for (const item of data.results) lines.push(`- ${item.worker_id}: ${item.status}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderWorkerRunSummary(data) {
  return [
    `agentctl worker-run: ${data.worker_id}`,
    `mode: ${data.mode}`,
    `result_path: ${data.result_path}`,
    data.exit_code !== undefined ? `exit_code: ${data.exit_code}` : '',
    ''
  ].filter(Boolean).join('\n');
}

function renderCollectSummary(data) {
  return [
    `agentctl collect: ${data.run_id}`,
    `collected: ${data.collected.join(', ') || 'none'}`,
    `missing: ${data.missing.join(', ') || 'none'}`,
    `report: ${data.report_path}`,
    ''
  ].join('\n');
}

function renderReviewSummary(data) {
  return [
    `agentctl review: ${data.run_id}`,
    `decision: ${data.decision}`,
    `report: ${data.report_path}`,
    ''
  ].join('\n');
}

function renderCleanupSummary(data) {
  return [
    `agentctl cleanup: ${data.run_id}`,
    `dry_run: ${data.dry_run}`,
    `removed: ${data.removed.length}`,
    `skipped: ${data.skipped.length}`,
    ''
  ].join('\n');
}

function renderWatchSummary(data) {
  const lines = [`agentctl watch: ${data.run_id}`, `status: ${data.status}`, `isolation: ${data.isolation}`, 'workers:'];
  for (const worker of data.workers) lines.push(`- ${worker.id}/${worker.agent}: ${worker.status}`);
  if (data.review) lines.push(`review: ${data.review.decision}`);
  lines.push('');
  return lines.join('\n');
}

function renderDelegateSummary(data) {
  return [
    `agentctl delegate: ${data.worker_id}`,
    `run_id: ${data.run_id}`,
    `work_order: ${data.work_order_path}`,
    ''
  ].join('\n');
}

function renderMetricsSummary(data) {
  return [
    `agentctl metrics: ${data.run_id}`,
    `report: ${data.report_path}`,
    `time_saving_percent: ${formatPercent(data.metrics.time_saving_percent)}`,
    `estimated_token_delta_percent: ${formatPercent(data.metrics.estimated_token_delta_percent)}`,
    ''
  ].join('\n');
}

function renderQaSummary(data) {
  return [
    `agentctl qa: ${data.run_id}`,
    `elapsed_ms: ${data.elapsed_ms}`,
    `review_decision: ${data.review_decision}`,
    `qa_report: ${data.qa_report_path}`,
    `time_saving_percent: ${formatPercent(data.metrics?.time_saving_percent || 0)}`,
    `estimated_token_delta_percent: ${formatPercent(data.metrics?.estimated_token_delta_percent || 0)}`,
    ''
  ].join('\n');
}

function renderListSummary(data) {
  const lines = [`agentctl list: ${data.project_root}`];
  if (!data.runs.length) {
    lines.push('runs: none', '');
    return lines.join('\n');
  }
  lines.push('runs:');
  for (const run of data.runs) {
    const workers = (run.workers || []).map((worker) => `${worker.id}/${worker.status}`).join(', ') || 'none';
    lines.push(`- ${run.run_id} [${run.status}] ${shorten(run.task, 72)}`);
    lines.push(`  updated: ${run.updated_at}`);
    lines.push(`  workers: ${workers}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderLatestSummary(data) {
  if (!data.run) return `agentctl latest: none\n`;
  return [
    `agentctl latest: ${data.run.run_id}`,
    `status: ${data.run.status}`,
    `updated: ${data.run.updated_at}`,
    `run_dir: ${data.run.run_dir}`,
    ''
  ].join('\n');
}

function printHelp() {
  process.stdout.write(`agentctl - multi-agent task dispatcher

Usage:
  agentctl publish --task "..." [--workers codex-main,opencode-support,antigravity-ui]
  agentctl list [--limit 10]
  agentctl latest
  agentctl dispatch --run-id <id> [--ghostty] [--execute] [--mode real|mock|dry-run]
  agentctl worker-run --run-id <id> --worker <id> [--mode real|mock]
  agentctl collect --run-id <id>
  agentctl review --run-id <id> [--mode rule|real]
  agentctl cleanup --run-id <id> [--dry-run]
  agentctl delegate --run-id <id> --from-worker <id> --to codex|opencode|antigravity --task "..."
  agentctl qa

Roles:
  Claude Code: planning, design, review.
  Codex: complex/main feature development.
  OpenCode: daily feature, bugfix, test, docs.
  Antigravity: frontend UI drawing and visual implementation.

Isolation:
  auto -> git worktree in Git projects, file locks otherwise.
`);
}

function ensureAgents() {
  fs.mkdirSync(path.join(agentsDir, 'project'), { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });
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
  return value === undefined || value === true ? fallback : value;
}

function hasFlag(name) {
  return args[name] === true;
}

function csv(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(csv);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function containsAny(text, needles) {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function dedupe(items) {
  return [...new Set(items)];
}

function sanitizeId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || timestampId();
}

function timestampId() {
  return new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function detectCaller() {
  const agent = process.env.AGENT_KNOWLEDGE_TOOL || process.env.AGENTCTL_CALLER || '';
  return agent || 'manual';
}

function resolveAgentctlPath() {
  const local = path.join(agentsDir, 'scripts/agentctl.mjs');
  if (fs.existsSync(local)) return local;
  return fileURLToPath(import.meta.url);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function applescriptString(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? readText(filePath) : '';
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function truncate(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function shorten(text, maxChars) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
