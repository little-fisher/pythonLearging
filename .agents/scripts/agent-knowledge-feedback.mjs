#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  effectiveKnowledgeLevel,
  inspectFeedbackEntries,
  isKnowledgeBearingEntry,
  isVerifiedImpact,
  isUsableTask,
  normalizeTask,
  parseFeedbackEntries,
  redactSensitiveText
} from './knowledge-feedback-quality.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = getMode();
const projectRoot = path.resolve(getArg('project-root', process.cwd()));
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const currentDir = path.resolve(getArg('memory-dir', path.join(agentsDir, 'project/memory/current')));
const monthlyDir = path.resolve(getArg('monthly-dir', path.join(agentsDir, 'project/memory/monthly')));
const feedbackPath = path.resolve(getArg('out', path.join(currentDir, 'feedback-candidates.md')));

if (hasFlag('help') || hasFlag('h')) {
  printHelp();
} else if (mode === 'init') {
  initMemory();
} else if (mode === 'summary') {
  writeSummary();
} else {
  appendFeedback();
}

function initMemory() {
  fs.mkdirSync(currentDir, { recursive: true });
  fs.mkdirSync(monthlyDir, { recursive: true });
  writeIfMissing(path.join(currentDir, 'task.md'), '# Current Task\n\n- task:\n- status:\n- scope:\n- stop_condition:\n');
  writeIfMissing(path.join(currentDir, 'evidence.md'), '# Evidence\n\n- validation:\n- result:\n- risk:\n');
  writeIfMissing(feedbackPath, '# Knowledge Feedback Raw Ledger\n\n> Append-only Agent task and outcome sources. The machine Wiki is compiled automatically; no per-entry promotion review is required.\n\n');
  console.log(`Initialized knowledge feedback memory: ${currentDir}`);
}

function appendFeedback() {
  fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
  if (!fs.existsSync(feedbackPath)) {
    fs.writeFileSync(feedbackPath, '# Knowledge Feedback Raw Ledger\n\n> Append-only Agent task and outcome sources. The machine Wiki is compiled automatically; no per-entry promotion review is required.\n\n');
  }

  const entry = normalizeEntry(readInput());
  if (!isUsableTask(entry.task) && !hasFlag('force')) {
    console.log('Knowledge feedback skipped: invalid or low-quality task');
    return;
  }
  if (hasExistingEntry(feedbackPath, entry.entry_id)) {
    console.log(`Knowledge feedback already exists: ${entry.entry_id}`);
    return;
  }
  fs.appendFileSync(feedbackPath, renderEntry(entry));
  console.log(`Appended knowledge feedback: ${feedbackPath}`);
  console.log(`knowledge_level=${entry.knowledge_level}`);
}

function writeSummary() {
  const month = getArg('month', currentMonth());
  const inputPath = path.resolve(getArg('in', feedbackPath));
  const outputPath = path.resolve(getArg('summary-out', path.join(monthlyDir, `${month}-knowledge-impact.md`)));
  const text = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, 'utf8') : '';
  const parsedEntries = parseFeedbackEntries(text).filter((entry) => entry.date.startsWith(month));
  const inspected = inspectFeedbackEntries(parsedEntries);
  const entries = inspected.entries;
  const filteredNoise = inspected.noiseCount;
  const counts = { K0: 0, K1: 0, K2: 0, K3: 0, K4: 0 };
  for (const entry of entries) {
    if (counts[entry.knowledge_level] !== undefined) counts[entry.knowledge_level] += 1;
  }
  const k2plus = entries.filter(isVerifiedImpact).length;
  const used = entries.filter((entry) => entry.knowledge_used === 'yes').length;
  const knowledgeAssets = entries.filter(isKnowledgeBearingEntry).length;
  const actualMinutes = entries
    .filter((entry) => !entry.duration_source.startsWith('estimated_'))
    .reduce((sum, entry) => sum + numericMinutes(entry.duration_minutes), 0);
  const estimatedMinutes = entries
    .filter((entry) => entry.duration_source.startsWith('estimated_'))
    .reduce((sum, entry) => sum + numericMinutes(entry.duration_minutes), 0);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderSummary({
    month,
    entries,
    counts,
    k2plus,
    used,
    knowledgeAssets,
    actualMinutes,
    estimatedMinutes,
    filteredNoise,
    mergedDuplicates: inspected.duplicateCount,
    inputPath
  }));
  console.log(`Wrote knowledge impact summary: ${outputPath}`);
}

function readInput() {
  const jsonPath = getArg('from-json', '');
  if (!jsonPath) return {};
  return JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
}

function normalizeEntry(input) {
  const merged = { ...input };
  for (const key of [
    'task',
    'agent-tool',
    'agent_tool',
    'workflow',
    'task-type',
    'task_type',
    'duration-minutes',
    'duration_minutes',
    'duration-hours',
    'duration_hours',
    'duration-source',
    'duration_source',
    'knowledge-used',
    'knowledge_used',
    'knowledge-level',
    'knowledge_level',
    'useful-sources',
    'useful_sources',
    'missing-sources',
    'missing_sources',
    'saved-explanation',
    'saved_explanation',
    'avoided-rework',
    'avoided_rework',
    'better-decision',
    'better_decision',
    'reusable-output',
    'reusable_output',
    'next-update',
    'next_update',
    'decisions',
    'validation',
    'reusable-asset',
    'reusable_asset',
    'suggested-destination',
    'suggested_destination',
    'confidence',
    'sensitive'
  ]) {
    const value = getArg(key, undefined);
    if (value !== undefined) merged[toSnake(key)] = value;
  }

  const knowledgeUsed = yesNo(merged.knowledge_used || 'no');
  const usefulSources = stringValue(merged.useful_sources);
  const level = normalizeLevel(merged.knowledge_level || inferLevel(knowledgeUsed, usefulSources));
  const durationMinutes = normalizeDurationMinutes(merged.duration_minutes, merged.duration_hours);
  const entry = {
    date: getArg('date', new Date().toISOString().slice(0, 10)),
    entry_id: stringValue(merged.entry_id || getArg('entry-id', '') || stableEntryId(merged)),
    task: normalizeTask(merged.task || '未填写任务'),
    agent_tool: stringValue(merged.agent_tool || 'unknown'),
    workflow: stringValue(merged.workflow || 'unknown'),
    task_type: stringValue(merged.task_type || 'unknown'),
    duration_minutes: durationMinutes ? String(durationMinutes) : 'unknown',
    duration_source: stringValue(merged.duration_source || (durationMinutes ? 'manual' : 'unknown')),
    knowledge_used: knowledgeUsed,
    knowledge_level: level,
    useful_sources: usefulSources || 'none',
    missing_sources: stringValue(merged.missing_sources || 'none'),
    saved_explanation: stringValue(merged.saved_explanation || 'unknown'),
    avoided_rework: stringValue(merged.avoided_rework || 'unknown'),
    better_decision: stringValue(merged.better_decision || 'unknown'),
    reusable_output: stringValue(merged.reusable_output || 'unknown'),
    next_update: stringValue(merged.next_update || 'none'),
    decisions: stringValue(merged.decisions || 'none'),
    validation: stringValue(merged.validation || 'none'),
    reusable_asset: stringValue(merged.reusable_asset || 'none'),
    suggested_destination: stringValue(merged.suggested_destination || 'none'),
    confidence: normalizeConfidence(merged.confidence || 'low'),
    sensitive: yesNo(merged.sensitive || 'no')
  };

  let detectedSensitive = entry.sensitive === 'yes';
  for (const key of [
    'task',
    'useful_sources',
    'missing_sources',
    'saved_explanation',
    'avoided_rework',
    'better_decision',
    'decisions',
    'validation',
    'reusable_asset',
    'reusable_output',
    'suggested_destination',
    'next_update'
  ]) {
    const redacted = redactSensitiveText(entry[key]);
    entry[key] = redacted.text || entry[key];
    detectedSensitive ||= redacted.sensitive;
  }
  entry.sensitive = detectedSensitive ? 'yes' : 'no';
  entry.knowledge_level = effectiveKnowledgeLevel(entry);
  return entry;
}

function renderEntry(entry) {
  return [
    '',
    `<!-- knowledge-feedback-id: ${entry.entry_id} -->`,
    `## ${entry.date} - ${entry.task}`,
    '',
    '### Knowledge Feedback',
    '',
    `- task_type: ${entry.task_type}`,
    `- agent_tool: ${entry.agent_tool}`,
    `- duration_minutes: ${entry.duration_minutes}`,
    `- duration_source: ${entry.duration_source}`,
    `- knowledge_used: ${entry.knowledge_used}`,
    `- useful_sources: ${entry.useful_sources}`,
    `- missing_sources: ${entry.missing_sources}`,
    `- decisions: ${entry.decisions}`,
    `- validation: ${entry.validation}`,
    `- reusable_asset: ${entry.reusable_asset}`,
    `- suggested_destination: ${entry.suggested_destination}`,
    `- confidence: ${entry.confidence}`,
    `- sensitive: ${entry.sensitive}`,
    '',
    '### Knowledge Impact',
    '',
    `- task: ${entry.task}`,
    `- workflow: ${entry.workflow}`,
    `- knowledge_level: ${entry.knowledge_level}`,
    `- useful_sources: ${entry.useful_sources}`,
    `- missing_sources: ${entry.missing_sources}`,
    `- saved_explanation: ${entry.saved_explanation}`,
    `- avoided_rework: ${entry.avoided_rework}`,
    `- better_decision: ${entry.better_decision}`,
    `- reusable_output: ${entry.reusable_output}`,
    `- next_update: ${entry.next_update}`,
    ''
  ].join('\n');
}

function hasExistingEntry(filePath, entryId) {
  if (!entryId || !fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, 'utf8').includes(`knowledge-feedback-id: ${entryId}`);
}

function renderSummary(summary) {
  const lines = [];
  lines.push(`# ${summary.month} 知识库有效性`);
  lines.push('');
  lines.push(`- Agent 任务数：${summary.entries.length}`);
  lines.push(`- 已过滤噪声：${summary.filteredNoise}`);
  lines.push(`- 已合并重复：${summary.mergedDuplicates}`);
  lines.push(`- 使用知识库任务数：${summary.used}`);
  lines.push(`- 已验证 K2+ 任务数：${summary.k2plus}`);
  lines.push(`- K0：${summary.counts.K0}`);
  lines.push(`- K1：${summary.counts.K1}`);
  lines.push(`- K2：${summary.counts.K2}`);
  lines.push(`- K3：${summary.counts.K3}`);
  lines.push(`- K4：${summary.counts.K4}`);
  if (summary.actualMinutes > 0) lines.push(`- 实际工时：${formatHours(summary.actualMinutes)}`);
  if (summary.estimatedMinutes > 0) lines.push(`- 估算工时（不计入实际）：${formatHours(summary.estimatedMinutes)}`);
  lines.push(`- 自动可复用知识资产：${summary.knowledgeAssets}`);
  lines.push('');
  lines.push('## 知识入口命中');
  lines.push('');
  const usefulSources = countValues(summary.entries.map((entry) => entry.useful_sources));
  if (usefulSources.length) {
    for (const [source, count] of usefulSources) lines.push(`- ${source}：${count}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## 缺失知识');
  lines.push('');
  const missingSources = countValues(summary.entries.map((entry) => entry.missing_sources));
  if (missingSources.length) {
    for (const [source, count] of missingSources) lines.push(`- ${source}：${count}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## 建议更新位置');
  lines.push('');
  const updateTargets = countValues(summary.entries.flatMap((entry) => [entry.suggested_destination, entry.next_update]));
  if (updateTargets.length) {
    for (const [target, count] of updateTargets) lines.push(`- ${target}：${count}`);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## 本月任务');
  lines.push('');
  for (const entry of summary.entries) {
    lines.push(`- ${entry.date} ${entry.knowledge_level} ${entry.task}`);
  }
  lines.push('');
  lines.push('## 数据来源');
  lines.push('');
  lines.push(`- ${summary.inputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    for (const part of splitValue(value)) {
      if (!part || ['none', 'unknown'].includes(part)) continue;
      counts.set(part, (counts.get(part) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'));
}

function splitValue(value) {
  return stringValue(value)
    .split(/;|；|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferLevel(knowledgeUsed, usefulSources) {
  if (knowledgeUsed !== 'yes') return 'K0';
  return !usefulSources || usefulSources === 'none' ? 'K0' : 'K1';
}

function stableEntryId(entry) {
  const raw = [
    entry.date || new Date().toISOString().slice(0, 10),
    entry.task || '',
    entry.workflow || '',
    entry.task_type || ''
  ].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
}

function normalizeDurationMinutes(minutesValue, hoursValue) {
  const minutes = numericMinutes(minutesValue);
  if (minutes > 0) return minutes;
  const hours = Number(stringValue(hoursValue));
  if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);
  return 0;
}

function numericMinutes(value) {
  const text = stringValue(value);
  if (!text || text === 'unknown') return 0;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function formatHours(minutes) {
  const rounded = Math.round((minutes / 60) * 2) / 2;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}H`;
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toSnake(value) {
  return String(value).replace(/-/g, '_');
}

function stringValue(value) {
  if (Array.isArray(value)) return value.join('; ');
  if (value === undefined || value === null || value === true) return '';
  return String(value).trim();
}

function yesNo(value) {
  const text = stringValue(value).toLowerCase();
  return ['yes', 'true', '1', 'y', '是', '有'].includes(text) ? 'yes' : 'no';
}

function normalizeLevel(value) {
  const match = stringValue(value).toUpperCase().match(/^K[0-4]$/);
  return match ? match[0] : 'K0';
}

function normalizeConfidence(value) {
  const text = stringValue(value).toLowerCase();
  return ['high', 'medium', 'low'].includes(text) ? text : 'low';
}

function getMode() {
  if (hasFlag('init')) return 'init';
  if (hasFlag('summary')) return 'summary';
  return stringValue(args._?.[0] || args.mode || 'append');
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

function hasFlag(name) {
  return args[name] === true;
}

function printHelp() {
  console.log(`Usage:
  agent-knowledge-feedback.mjs --init [--project-root .]
  agent-knowledge-feedback.mjs append --task "..." --knowledge-level K2 [fields...]
  agent-knowledge-feedback.mjs append --from-json /tmp/knowledge-feedback.json
  agent-knowledge-feedback.mjs summary --month YYYY-MM

Common fields:
  --workflow
  --task-type
  --duration-minutes
  --duration-source
  --knowledge-used yes|no
  --knowledge-level K0|K1|K2|K3|K4
  --entry-id
  --useful-sources
  --missing-sources
  --decisions
  --validation
  --reusable-asset
  --suggested-destination
  --saved-explanation
  --avoided-rework
  --better-decision
  --reusable-output
  --next-update
  --confidence high|medium|low
  --sensitive yes|no
`);
}
