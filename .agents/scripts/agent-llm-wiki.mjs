#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  feedbackEntryRank,
  hasStrongValidation,
  inspectFeedbackEntries,
  isKnowledgeBearingEntry,
  parseFeedbackEntries,
  redactSensitiveText,
  semanticTaskKey,
  tasksMatch
} from './knowledge-feedback-quality.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const GENERATOR_VERSION = '1';
const EMPTY = /^(?:none|unknown|无|暂无|待补充|pending|auto-candidate|pending-review)$/i;

export function buildWikiProjection(rawEntries) {
  const inspected = inspectFeedbackEntries(rawEntries);
  const entries = [...inspected.entries].sort(compareEntries);
  const groups = [];

  // ponytail: O(n²) fuzzy grouping is fine for hundreds of records; index it only after measured slowdown at thousands.
  for (const entry of entries) {
    const group = groups.find((candidate) => tasksMatch(candidate.entries[0].task, entry.task));
    if (group) group.entries.push(entry);
    else groups.push({ entries: [entry] });
  }

  const units = groups
    .map(buildUnit)
    .filter(Boolean)
    .sort((left, right) => stateRank(right.state) - stateRank(left.state)
      || right.latest_date.localeCompare(left.latest_date)
      || left.task.localeCompare(right.task, 'zh-Hans-CN'));
  const taskOnlyCount = entries.filter((entry) => !isKnowledgeBearingEntry(entry)).length;
  const sourceDigest = sha256(JSON.stringify(entries.map(sourceFingerprint)));
  const stats = {
    raw_count: rawEntries.length,
    trusted_count: entries.length,
    noise_count: inspected.noiseCount,
    ledger_duplicate_count: inspected.duplicateCount,
    cross_source_duplicate_count: entries.length - groups.length,
    task_only_count: taskOnlyCount,
    unit_count: units.length,
    established_count: units.filter((unit) => unit.state === 'established').length,
    repeated_count: units.filter((unit) => unit.state === 'repeated').length,
    observed_count: units.filter((unit) => unit.state === 'observed').length,
    reconcile_count: units.filter((unit) => unit.needs_reconcile).length
  };
  const snapshot = sha256(`${GENERATOR_VERSION}|${sourceDigest}|${JSON.stringify(units)}`).slice(0, 16);
  const latestDate = entries.map((entry) => entry.date).sort().at(-1) || '0000-00-00';
  return { units, stats, snapshot, source_digest: sourceDigest, latest_date: latestDate };
}

export function renderWiki(projection) {
  const { units, stats, snapshot, latest_date: latestDate } = projection;
  const lines = [
    '---',
    'id: auto-compounding-llm-wiki',
    'title: 自动复利 LLM Wiki',
    'type: generated-wiki',
    'scope: personal-kb',
    'status: active',
    `last_refresh: ${latestDate}`,
    `generator_version: ${GENERATOR_VERSION}`,
    `snapshot: ${snapshot}`,
    'generated_by: agent-llm-wiki',
    '---',
    '',
    '# 自动复利 LLM Wiki',
    '',
    '> 本页由 Agent 从各项目 append-only Knowledge Feedback Raw Ledger 自动编译。无需人工晋级；低证据内容标记为 observed，重复或有验证证据时自动升级。',
    '',
    '## 编译状态',
    '',
    `- 原始记录：${stats.raw_count}`,
    `- 可信记录：${stats.trusted_count}`,
    `- 过滤噪声：${stats.noise_count}`,
    `- Ledger 重复：${stats.ledger_duplicate_count}`,
    `- 跨项目/跨日期合并：${stats.cross_source_duplicate_count}`,
    `- 仅任务记录：${stats.task_only_count}`,
    `- 知识单元：${stats.unit_count}`,
    `- established：${stats.established_count}`,
    `- repeated：${stats.repeated_count}`,
    `- observed：${stats.observed_count}`,
    `- 多结论待自动调和：${stats.reconcile_count}`,
    '',
    '## 状态说明',
    '',
    '- `established`：至少一条高置信记录带可识别验证证据，或同一知识出现 3 次以上。',
    '- `repeated`：同一知识来自至少 2 个独立项目/日期来源。',
    '- `observed`：首次出现，仍可检索，但回答时应保留不确定性。',
    '- `needs_reconcile: yes`：存在多个不同结论，全部保留，禁止静默覆盖。',
    ''
  ];

  for (const state of ['established', 'repeated', 'observed']) {
    lines.push(`## ${state}`, '');
    const stateUnits = units.filter((unit) => unit.state === state);
    if (!stateUnits.length) {
      lines.push('- none', '');
      continue;
    }
    for (const unit of stateUnits) lines.push(...renderUnit(unit));
  }
  return `${lines.join('\n')}\n`;
}

export function writeWikiProjection(projection, options = {}) {
  const wikiDir = path.resolve(options.wikiDir || '个人知识管理/wiki');
  const indexPath = path.join(wikiDir, 'index.md');
  const logPath = path.join(wikiDir, 'log.md');
  const lockPath = path.join(wikiDir, '.compile.lock');
  fs.mkdirSync(wikiDir, { recursive: true });
  const ownsLock = !Number.isInteger(options.lock);
  const lock = ownsLock ? acquireLock(lockPath, options.lockWaitMs || 0) : options.lock;
  if (!Number.isInteger(lock)) return { changed: false, locked: true, indexPath, logPath };

  const content = renderWiki(projection);
  const previous = readText(indexPath);
  const tempPath = `${indexPath}.tmp-${process.pid}`;
  try {
    validateGeneratedWiki(content, projection);
    if (previous === content) {
      const logChanged = appendLogOnce(logPath, projection);
      return { changed: logChanged, locked: false, log_repaired: logChanged, indexPath, logPath };
    }
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, indexPath);
    appendLogOnce(logPath, projection);
    return { changed: true, locked: false, indexPath, logPath };
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath);
    if (ownsLock) releaseLock(lock, lockPath);
  }
}

export function compileWiki(options = {}) {
  const wikiDir = path.resolve(options.wikiDir || '个人知识管理/wiki');
  const indexPath = path.join(wikiDir, 'index.md');
  const logPath = path.join(wikiDir, 'log.md');
  const lockPath = path.join(wikiDir, '.compile.lock');
  fs.mkdirSync(wikiDir, { recursive: true });
  const lock = acquireLock(lockPath, options.lockWaitMs ?? 5000);
  if (!Number.isInteger(lock)) {
    return { projection: null, result: { changed: false, locked: true, indexPath, logPath } };
  }

  try {
    // Read Raw only after acquiring the lock so a waiting compiler cannot publish a stale projection.
    const rawEntries = loadRawEntries({
      registryPath: options.registryPath,
      includeTemporary: options.includeTemporary === true
    });
    const projection = buildWikiProjection(rawEntries);
    const result = writeWikiProjection(projection, { wikiDir, lock });
    return { projection, result };
  } finally {
    releaseLock(lock, lockPath);
  }
}

export function lintWiki(projection, options = {}) {
  const wikiDir = path.resolve(options.wikiDir || '个人知识管理/wiki');
  const indexPath = path.join(wikiDir, 'index.md');
  const logPath = path.join(wikiDir, 'log.md');
  const errors = [];
  const content = readText(indexPath);
  if (!content) errors.push(`missing index: ${indexPath}`);
  else {
    try {
      validateGeneratedWiki(content, projection);
    } catch (error) {
      errors.push(error.message);
    }
    if (content !== renderWiki(projection)) errors.push('compiled Wiki is stale');
  }
  const log = readText(logPath);
  if (!log.includes(`snapshot=${projection.snapshot}`)) errors.push(`log is missing snapshot ${projection.snapshot}`);
  return { ok: errors.length === 0, errors, indexPath, logPath, stats: projection.stats, snapshot: projection.snapshot };
}

function buildUnit(group) {
  const knowledgeEntries = group.entries.filter(isKnowledgeBearingEntry);
  if (!knowledgeEntries.length) return null;
  const ranked = [...knowledgeEntries].sort((left, right) => feedbackEntryRank(right) - feedbackEntryRank(left)
    || right.date.localeCompare(left.date)
    || Number(right.source_order || 0) - Number(left.source_order || 0));
  const representative = ranked[0];
  const sources = uniqueBy(knowledgeEntries.map(buildSource), (source) => source.key);
  const supportCount = new Set(sources.map((source) => source.support_key)).size;
  const variants = uniqueBy(
    knowledgeEntries.map(preferredKnowledge).filter(Boolean),
    (value) => semanticTaskKey(value)
  );
  const hasEvidence = knowledgeEntries.some((entry) => entry.confidence === 'high' && hasStrongValidation(entry.validation));
  const state = hasEvidence || supportCount >= 3 ? 'established' : supportCount >= 2 ? 'repeated' : 'observed';
  const unitKey = group.entries.map((entry) => semanticTaskKey(entry.task)).filter(Boolean).sort()[0];
  return {
    unit_id: sha256(unitKey).slice(0, 12),
    task: representative.task,
    state,
    needs_reconcile: variants.length > 1,
    occurrence_count: supportCount,
    latest_date: sources.map((source) => source.date).sort().at(-1),
    workflows: [...new Set(group.entries.map((entry) => entry.workflow).filter(meaningful))].sort(),
    task_types: [...new Set(group.entries.map((entry) => entry.task_type).filter(meaningful))].sort(),
    synthesis: preferredKnowledge(representative),
    validation: meaningful(representative.validation) ? representative.validation : 'none',
    variants,
    sources
  };
}

function renderUnit(unit) {
  const lines = [
    `### ${escapeHeading(unit.task)}`,
    '',
    `- unit_id: ${unit.unit_id}`,
    `- state: ${unit.state}`,
    `- needs_reconcile: ${unit.needs_reconcile ? 'yes' : 'no'}`,
    `- occurrence_count: ${unit.occurrence_count}`,
    `- latest_source_date: ${unit.latest_date}`,
    `- workflows: ${unit.workflows.join('; ') || 'unknown'}`,
    `- task_types: ${unit.task_types.join('; ') || 'unknown'}`,
    '',
    '#### 当前综合结论',
    '',
    `> ${unit.synthesis || '仅有来源记录，等待后续任务补强。'}`,
    '',
    '#### 验证',
    '',
    `> ${unit.validation}`,
    ''
  ];
  if (unit.variants.length > 1) {
    lines.push('#### 并存结论', '');
    for (const variant of unit.variants) lines.push(`- ${variant}`);
    lines.push('');
  }
  lines.push('#### source_refs', '');
  for (const source of unit.sources) {
    lines.push(`- ${source.date} [${source.project}] \`${source.path}\` entry=${source.entry_id} hash=${source.hash}`);
  }
  lines.push('');
  return lines;
}

function knowledgeVariants(entry) {
  return [entry.reusable_output, entry.decisions, entry.reusable_asset].filter(meaningful);
}

function preferredKnowledge(entry) {
  return knowledgeVariants(entry)[0] || '';
}

function buildSource(entry) {
  const sourcePath = redactSensitiveText(entry.source_path || 'unknown').text;
  const entryId = entry.id || sha256(sourceFingerprint(entry)).slice(0, 12);
  const project = redactSensitiveText(entry.project_name || path.basename(entry.project_root || '') || 'unknown').text;
  const key = `${entry.project_root || ''}|${entry.date}|${entryId}`;
  return {
    key,
    support_key: `${entry.project_root || ''}|${entry.date}`,
    date: entry.date,
    project,
    path: sourcePath,
    entry_id: entryId,
    hash: sha256(sourceFingerprint(entry)).slice(0, 12)
  };
}

function sourceFingerprint(entry) {
  return [
    entry.project_root,
    entry.date,
    entry.id,
    entry.task,
    entry.decisions,
    entry.validation,
    entry.reusable_asset,
    entry.reusable_output
  ].map((value) => String(value ?? '')).join('|');
}

function validateGeneratedWiki(content, projection) {
  if (!content.includes('generated_by: agent-llm-wiki')) throw new Error('generated Wiki marker missing');
  if (!content.includes(`snapshot: ${projection.snapshot}`)) throw new Error('generated Wiki snapshot mismatch');
  if (projection.units.some((unit) => !unit.sources.length)) throw new Error('knowledge unit missing source_refs');
  const secret = rawSecret(content);
  if (secret) throw new Error(`generated Wiki contains unredacted sensitive pattern: ${secret}`);
}

function rawSecret(text) {
  const checks = [
    ['personal path', /\/Users\/[^/\s]+/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/i],
    ['basic auth', /\bBasic\s+(?!\[密钥\])[A-Za-z0-9+/=]{8,}/i],
    ['bearer token', /\bBearer\s+(?!\[密钥\])[A-Za-z0-9._~+\/-]{8,}/i],
    ['access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['github token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
    ['api token', /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/],
    ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
    ['url credentials', /\bhttps?:\/\/[^/\s:@]+:[^@\s/]+@/i],
    ['plain secret', /\b(?:password|secret|api[_-]?key|access_token)\s*[:=]\s*(?!\[密钥\])[^\s,;]+/i]
  ];
  return checks.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function appendLogOnce(logPath, projection) {
  const previous = readText(logPath);
  if (previous.includes(`snapshot=${projection.snapshot}`)) return false;
  const prefix = previous || '# 自动复利 LLM Wiki Log\n\n> append-only compile log\n\n';
  const entry = [
    `## [${new Date().toISOString().slice(0, 10)}] ingest | snapshot=${projection.snapshot}`,
    '',
    `- sources: ${projection.stats.trusted_count}`,
    `- units: ${projection.stats.unit_count}`,
    `- established: ${projection.stats.established_count}`,
    `- repeated: ${projection.stats.repeated_count}`,
    `- observed: ${projection.stats.observed_count}`,
    ''
  ].join('\n');
  fs.writeFileSync(logPath, `${prefix}${entry}`);
  return true;
}

function acquireLock(lockPath, waitMs = 0) {
  const deadline = Date.now() + Math.max(0, waitMs);
  while (true) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age >= 5 * 60 * 1000) {
          fs.rmSync(lockPath, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() >= deadline) return null;
      sleepSync(Math.min(50, deadline - Date.now()));
    }
  }
}

function releaseLock(lock, lockPath) {
  try {
    fs.closeSync(lock);
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}

function sleepSync(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function loadRawEntries(options) {
  const registry = readJson(options.registryPath, { projects: [] });
  const entries = [];
  for (const project of registry.projects || []) {
    const projectRoot = path.resolve(project.root || '');
    if (!options.includeTemporary && isTemporary(projectRoot)) continue;
    const feedbackPath = path.join(projectRoot, '.agents/project/memory/current/feedback-candidates.md');
    if (!fs.existsSync(feedbackPath)) continue;
    for (const entry of parseFeedbackEntries(fs.readFileSync(feedbackPath, 'utf8'))) {
      entries.push({
        ...entry,
        project_root: projectRoot,
        project_name: path.basename(projectRoot),
        source_path: feedbackPath
      });
    }
  }
  return entries;
}

function compareEntries(left, right) {
  return semanticTaskKey(left.task).localeCompare(semanticTaskKey(right.task), 'zh-Hans-CN')
    || left.date.localeCompare(right.date)
    || String(left.project_root || '').localeCompare(String(right.project_root || ''));
}

function stateRank(state) {
  return { observed: 1, repeated: 2, established: 3 }[state] || 0;
}

function meaningful(value) {
  const text = String(value ?? '').trim();
  return text.length >= 4 && !EMPTY.test(text) && !/(?:auto-hook|请由Agent)/i.test(text);
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeHeading(value) {
  return String(value ?? '').replace(/^#+\s*/, '').replace(/[\r\n]+/g, ' ').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function isTemporary(root) {
  return root.startsWith('/tmp/') || root.startsWith('/private/tmp/') || root.startsWith('/var/folders/');
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0] || 'compile';
  const home = process.env.HOME || os.homedir();
  const knowledgeRoot = path.resolve(args['knowledge-root'] === true || !args['knowledge-root']
    ? process.env.KNOWLEDGE_ROOT || '/Users/luhonggang/Documents/Knowledge'
    : args['knowledge-root']);
  const registryPath = path.resolve(args.registry === true || !args.registry
    ? path.join(home, '.agents/knowledge-feedback/projects.json')
    : args.registry);
  const wikiDir = path.resolve(args['wiki-dir'] === true || !args['wiki-dir']
    ? path.join(knowledgeRoot, '个人知识管理/wiki')
    : args['wiki-dir']);
  if (mode === 'compile') {
    const compiled = compileWiki({
      wikiDir,
      registryPath,
      includeTemporary: args['include-temporary'] === true,
      lockWaitMs: 5000
    });
    const projection = compiled.projection;
    const output = projection
      ? { ok: true, ...compiled.result, stats: projection.stats, snapshot: projection.snapshot }
      : { ok: false, ...compiled.result, errors: ['compile lock timeout'], stats: {}, snapshot: '' };
    process.stdout.write(args.json === true ? `${JSON.stringify(output)}\n` : renderStatus(output));
    if (!output.ok) process.exitCode = 1;
    return;
  }
  if (mode === 'lint' || mode === 'status') {
    const rawEntries = loadRawEntries({ registryPath, includeTemporary: args['include-temporary'] === true });
    const projection = buildWikiProjection(rawEntries);
    const result = lintWiki(projection, { wikiDir });
    process.stdout.write(args.json === true ? `${JSON.stringify(result)}\n` : renderStatus(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

function renderStatus(result) {
  const stats = result.stats || {};
  return [
    `LLM Wiki: ${result.ok === false ? 'fail' : result.locked ? 'locked' : result.changed ? 'updated' : 'current'}`,
    `snapshot=${result.snapshot || 'unknown'}`,
    `units=${stats.unit_count || 0} established=${stats.established_count || 0} repeated=${stats.repeated_count || 0} observed=${stats.observed_count || 0}`,
    ...(result.errors || []).map((error) => `error=${error}`),
    ''
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`LLM Wiki failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
