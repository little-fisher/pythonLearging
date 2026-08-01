#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  extractOutcomeFromHookInput,
  extractOutcomeFromTranscript,
  extractTaskFromHookInput,
  extractTaskFromTranscript,
  isUsableTask,
  semanticTaskKey,
  tasksMatch
} from './knowledge-feedback-quality.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const hookInput = readHookInput();
const projectRoot = resolveProjectRoot();
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const currentDir = path.join(agentsDir, 'project/memory/current');
const contextPackPath = path.join(currentDir, 'context-pack.md');
const evidencePath = path.join(currentDir, 'evidence.md');
const appendScript = path.join(scriptDir, 'agent-knowledge-feedback.mjs');

main();

function main() {
  const context = readContextPack();
  const observed = readObservedTask();
  if (observed.seen && !observed.task) {
    console.log('Knowledge feedback hook skipped: no meaningful user task');
    return;
  }

  const contextMatches = context.fresh && (!observed.seen || tasksMatch(observed.task, context.task));
  const task = observed.task || (context.fresh ? context.task : '');
  if (!isUsableTask(task)) {
    console.log('Knowledge feedback hook skipped: invalid or stale task');
    return;
  }

  const taskType = contextMatches ? context.task_type : inferTaskType(task);
  const size = contextMatches ? context.size : inferSize(task);
  const outcome = readObservedOutcome();

  if (!shouldRecord(size)) {
    console.log(`Knowledge feedback hook skipped: size=${size}`);
    return;
  }

  const usefulSources = contextMatches && context.docs.length ? context.docs.join('; ') : 'none';
  const eventIdentity = semanticTaskKey(outcome)
    || hookInput.session_id
    || hookInput.sessionID
    || hookInput.sessionId
    || hookInput.conversation_id
    || hookInput.conversationId
    || hookInput.transcript_path
    || hookInput.transcriptPath;
  const entryId = stableId([
    new Date().toISOString().slice(0, 10),
    projectRoot,
    taskType,
    semanticTaskKey(task),
    eventIdentity
  ]);
  const hasEvidence = readEvidence();
  const level = usefulSources === 'none' ? 'K0' : 'K1';
  const duration = inferDuration(size, hookInput);

  const commandArgs = [
    appendScript,
    'append',
    '--project-root', projectRoot,
    '--agents-dir', agentsDir,
    '--entry-id', entryId,
    '--task', task,
    '--agent-tool', process.env.AGENT_KNOWLEDGE_TOOL || hookInput.agent_tool || hookInput.agentTool || 'unknown',
    '--workflow', workflowForTaskType(taskType),
    '--task-type', taskType,
    '--duration-minutes', String(duration.minutes),
    '--duration-source', duration.source,
    '--knowledge-used', usefulSources === 'none' ? 'no' : 'yes',
    '--knowledge-level', level,
    '--useful-sources', usefulSources,
    '--missing-sources', 'none',
    '--decisions', 'pending-review',
    '--validation', hasEvidence ? 'evidence.md recorded' : 'none',
    '--reusable-asset', 'auto-candidate',
    '--suggested-destination', '项目 .agents/project/memory/current/feedback-candidates.md',
    '--saved-explanation', 'unknown',
    '--avoided-rework', 'unknown',
    '--better-decision', 'unknown',
    '--reusable-output', outcome || 'auto-candidate',
    '--next-update', nextUpdateForTaskType(taskType),
    '--confidence', 'low',
    '--sensitive', 'yes'
  ];

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status && result.status !== 0) process.exitCode = result.status;

  if (!result.stdout?.includes('already exists')) updateProjectGraph(size);
}

function shouldRecord(size) {
  if (hasFlag('force')) return true;
  if (process.env.AGENT_KNOWLEDGE_FEEDBACK === '0') return false;
  return ['normal', 'complex', 'long'].includes(size);
}

function updateProjectGraph(size) {
  if (process.env.AGENT_PROJECT_GRAPH === '0') return;
  if (!['normal', 'complex', 'long'].includes(size)) return;
  const graphScript = path.join(scriptDir, 'agent-project-graph.mjs');
  if (!fs.existsSync(graphScript)) return;

  const result = spawnSync(process.execPath, [
    graphScript,
    '--project-root', projectRoot,
    '--agents-dir', agentsDir,
    '--write',
    '--git-changes',
    '--no-codegraph',
    '--quiet'
  ], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.status && result.status !== 0) {
    process.stderr.write(`Project graph hook skipped: ${result.stderr || result.stdout || result.status}\n`);
  }
}

function readContextPack() {
  if (!fs.existsSync(contextPackPath)) return { exists: false, fresh: false, docs: [] };
  const text = fs.readFileSync(contextPackPath, 'utf8');
  return {
    exists: true,
    fresh: Date.now() - fs.statSync(contextPackPath).mtimeMs < 2 * 60 * 60 * 1000,
    task: section(text, 'Task').trim().split('\n').filter(Boolean).join(' ').slice(0, 300),
    task_type: value(text, 'primary_type') || 'unknown',
    size: value(text, 'size') || 'normal',
    docs: [...text.matchAll(/^- \[ok\] ([^\s]+.*?) \(/gm)]
      .map((match) => match[1].trim())
      .filter((doc) => !/^AGENTS\.md$/.test(doc))
      .slice(0, 12)
  };
}

function readObservedTask() {
  const direct = extractTaskFromHookInput(hookInput);
  if (direct.seen) return direct;
  const transcriptPath = hookInput.transcript_path || hookInput.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { seen: false, task: '' };
  const text = fs.readFileSync(transcriptPath, 'utf8');
  return extractTaskFromTranscript(text);
}

function readObservedOutcome() {
  const direct = extractOutcomeFromHookInput(hookInput);
  if (direct.seen) return direct.outcome;
  const transcriptPath = hookInput.transcript_path || hookInput.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  const text = fs.readFileSync(transcriptPath, 'utf8');
  return extractOutcomeFromTranscript(text).outcome;
}

function readEvidence() {
  if (!fs.existsSync(evidencePath)) return false;
  return fs.readFileSync(evidencePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith('#') && !/^- (?:validation|result|risk):\s*$/.test(line));
}

function inferDuration(size, input) {
  const explicitMinutes = firstPositiveNumber(input, [
    'duration_minutes',
    'durationMinutes',
    'elapsed_minutes',
    'elapsedMinutes',
    'session_duration_minutes',
    'sessionDurationMinutes'
  ]);
  if (explicitMinutes) return { minutes: Math.round(explicitMinutes), source: 'hook_input_minutes' };

  const explicitHours = firstPositiveNumber(input, [
    'duration_hours',
    'durationHours',
    'elapsed_hours',
    'elapsedHours',
    'session_duration_hours',
    'sessionDurationHours'
  ]);
  if (explicitHours) return { minutes: Math.round(explicitHours * 60), source: 'hook_input_hours' };

  const explicitMs = firstPositiveNumber(input, [
    'duration_ms',
    'durationMs',
    'elapsed_ms',
    'elapsedMs',
    'runtime_ms',
    'runtimeMs',
    'session_duration_ms',
    'sessionDurationMs'
  ]);
  if (explicitMs) return { minutes: Math.max(1, Math.round(explicitMs / 60000)), source: 'hook_input_ms' };

  const start = firstTime(input, ['started_at', 'startedAt', 'created_at', 'createdAt', 'session_started_at', 'sessionStartedAt']);
  const end = firstTime(input, ['ended_at', 'endedAt', 'finished_at', 'finishedAt', 'session_ended_at', 'sessionEndedAt']) || Date.now();
  if (start && end > start) return { minutes: Math.max(1, Math.round((end - start) / 60000)), source: 'hook_input_time_range' };

  const estimates = {
    micro: 15,
    normal: 60,
    complex: 120,
    long: 240
  };
  return { minutes: estimates[size] || 60, source: 'estimated_by_task_size' };
}

function firstPositiveNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function firstTime(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (!value) continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1000000000000 ? value : value * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function workflowForTaskType(taskType) {
  const map = {
    'bug-fix': '前端/后端排障',
    'interaction-change': '前端方案评审',
    'page-build': '前端方案评审',
    'asset-data-update': '资源/数据更新',
    regression: '测试回归',
    'requirement-change': 'PRD / 需求分析辅助'
  };
  return map[taskType] || 'unknown';
}

function nextUpdateForTaskType(taskType) {
  const map = {
    'bug-fix': '候选：前端技术沉淀/场景专题 或 项目 .agents/project/rules',
    'interaction-change': '候选：前端技术沉淀/场景专题 或 个人知识管理/02-工作流索引.md',
    'page-build': '候选：前端技术沉淀/场景专题 或 模板库',
    'asset-data-update': '候选：项目 .agents/project/architecture 或 工具模板',
    regression: '候选：AI工程/Harness工程模板/core/validation 或 项目验证规则',
    'requirement-change': '候选：个人知识管理/02-工作流索引.md 或 项目 .agents/project/requirements'
  };
  return map[taskType] || '候选：个人知识管理/06-Agent实时记忆与能力更新.md';
}

function section(text, title) {
  const pattern = new RegExp(`## ${escapeRegExp(title)}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  return text.match(pattern)?.[1] || '';
}

function value(text, name) {
  return text.match(new RegExp(`^- ${escapeRegExp(name)}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
}

function inferTaskType(text) {
  const normalized = text.toLowerCase();
  const rules = [
    ['bug-fix', ['bug', 'fix', '修复', '报错', '错误', '异常', '失败', '不生效', '错位']],
    ['interaction-change', ['交互', '点击', '按钮', '弹窗', '状态', '切换', 'hover']],
    ['page-build', ['页面', '模块', '布局', '大屏', '组件']],
    ['asset-data-update', ['图片', 'svg', 'pdf', 'json', 'csv', '数据', '资源', '脚本']],
    ['regression', ['回归', '验证', '检查', 'review', '评审']],
    ['requirement-change', ['需求', '修改', '调整', '改造', '规则', '工程化', '模板', '治理']]
  ];
  return rules.find(([, keys]) => keys.some((key) => normalized.includes(key)))?.[0] || 'requirement-change';
}

function inferSize(text) {
  const normalized = text.toLowerCase();
  if (['长期', '多轮', '分阶段', '路线图', '接手', '月度', '季度'].some((key) => normalized.includes(key))) return 'long';
  if (['跨模块', '跨状态', '跨路由', '公开接口', '地图', 'canvas', '工程化', '自动', 'hook'].some((key) => normalized.includes(key))) return 'complex';
  if (normalized.length < 80 && ['文案', '改字', '格式', '单文件'].some((key) => normalized.includes(key))) return 'micro';
  return 'normal';
}

function resolveProjectRoot() {
  const fromArg = getArg('project-root', '');
  if (fromArg) return path.resolve(fromArg);
  if (process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  if (hookInput.cwd) return path.resolve(hookInput.cwd);
  return process.cwd();
}

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function stableId(parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 12);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    parsed[key] = value;
  }
  return parsed;
}

function getArg(name, fallback) {
  const value = args[name];
  return value === undefined || value === true ? fallback : value;
}

function hasFlag(name) {
  return args[name] === true;
}
