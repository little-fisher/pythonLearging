import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildWikiProjection,
  lintWiki,
  renderWiki,
  writeWikiProjection
} from './agent-llm-wiki.mjs';

test('automatic Wiki dedupes, upgrades evidence state, redacts, and writes idempotently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-llm-wiki-'));
  const wikiDir = path.join(root, 'wiki');
  const entries = [
    entry({
      id: 'a-one',
      task: '修复：合同列表分页重复请求',
      date: '2026-07-10',
      project_root: '/Users/luhonggang/Project/A',
      project_name: 'A',
      reusable_output: '使用请求锁避免重复分页请求'
    }),
    entry({
      id: 'b-two',
      task: '修复合同列表分页重复请求',
      date: '2026-07-12',
      project_root: '/Users/luhonggang/Project/B',
      project_name: 'B',
      reusable_output: '统一请求状态后不再发出重复分页请求'
    }),
    entry({
      id: 'ghp_abcdefghijklmnopqrstuvwxyz123456',
      task: '修复地图缩放后的点击偏移',
      date: '2026-07-12',
      project_root: '/Users/luhonggang/Project/C',
      project_name: 'C',
      confidence: 'high',
      knowledge_level: 'K3',
      validation: 'node --test 全部通过，password=hunter2',
      reusable_output: '统一坐标换算后点击恢复，Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=='
    }),
    entry({
      id: 'task-only',
      task: '整理合同页面标题',
      date: '2026-07-12',
      project_root: '/Users/luhonggang/Project/C',
      project_name: 'C'
    }),
    entry({ id: 'noise', task: '"total_tokens":999', date: '2026-07-12' })
  ];

  const projection = buildWikiProjection(entries);
  assert.equal(projection.stats.unit_count, 2);
  assert.equal(projection.stats.task_only_count, 1);
  assert.equal(projection.stats.noise_count, 1);
  const pagination = projection.units.find((unit) => unit.task.includes('分页'));
  assert.equal(pagination.state, 'repeated');
  assert.equal(pagination.occurrence_count, 2);
  assert.equal(pagination.needs_reconcile, true);
  const map = projection.units.find((unit) => unit.task.includes('地图'));
  assert.equal(map.state, 'established');

  const content = renderWiki(projection);
  assert.doesNotMatch(content, /\/Users\/luhonggang|hunter2|QWxhZGRpbjpvcGVuIHNlc2FtZQ==/);
  assert.doesNotMatch(content, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.match(content, /password=\[密钥\]/);
  assert.match(content, /Basic \[密钥\]/);

  const first = writeWikiProjection(projection, { wikiDir });
  assert.equal(first.changed, true);
  const firstHash = hash(fs.readFileSync(first.indexPath));
  const second = writeWikiProjection(projection, { wikiDir });
  assert.equal(second.changed, false);
  assert.equal(hash(fs.readFileSync(first.indexPath)), firstHash);
  assert.equal((fs.readFileSync(first.logPath, 'utf8').match(/\] ingest \| snapshot=/g) || []).length, 1);
  assert.equal(lintWiki(projection, { wikiDir }).ok, true);

  fs.rmSync(first.logPath);
  const repaired = writeWikiProjection(projection, { wikiDir });
  assert.equal(repaired.changed, true);
  assert.equal(repaired.log_repaired, true);
  assert.equal(hash(fs.readFileSync(first.indexPath)), firstHash);
  assert.equal(lintWiki(projection, { wikiDir }).ok, true);

  const unsafe = structuredClone(projection);
  unsafe.units[0].synthesis = 'password=hunter2';
  assert.throws(() => writeWikiProjection(unsafe, { wikiDir }), /unredacted sensitive pattern/);
  assert.equal(hash(fs.readFileSync(first.indexPath)), firstHash);
  assert.equal(fs.existsSync(path.join(wikiDir, '.compile.lock')), false);

  const unsafeId = structuredClone(projection);
  unsafeId.units[0].sources[0].entry_id = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  assert.throws(() => writeWikiProjection(unsafeId, { wikiDir }), /github token/);
  assert.equal(hash(fs.readFileSync(first.indexPath)), firstHash);

  fs.rmSync(root, { recursive: true, force: true });
});

test('evidence state counts only independent knowledge-bearing project/date sources', () => {
  const task = '完善知识回流自动编译流程';
  const projection = buildWikiProjection([
    entry({ id: 'knowledge', task, reusable_output: '统一编译器负责生成 Wiki', project_root: '/Project/A', date: '2026-07-12' }),
    entry({ id: 'task-only-b', task: `${task}。`, project_root: '/Project/B', date: '2026-07-11' }),
    entry({ id: 'task-only-c', task: `${task}！`, project_root: '/Project/C', date: '2026-07-10' })
  ]);
  assert.equal(projection.stats.task_only_count, 2);
  assert.equal(projection.units[0].state, 'observed');
  assert.equal(projection.units[0].occurrence_count, 1);
  assert.equal(projection.units[0].sources.length, 1);

  const sameSource = buildWikiProjection([
    entry({ id: 'same-1', task, reusable_output: '先追加 Raw 再编译 Wiki', project_root: '/Project/A', date: '2026-07-12' }),
    entry({ id: 'same-2', task: `${task}并保留日志`, reusable_output: '编译后追加快照日志', project_root: '/Project/A', date: '2026-07-12' }),
    entry({ id: 'same-3', task: `${task}并保留日志与来源`, reusable_output: '知识单元必须保留来源', project_root: '/Project/A', date: '2026-07-12' })
  ]);
  assert.equal(sameSource.units.length, 1);
  assert.equal(sameSource.units[0].state, 'observed');
  assert.equal(sameSource.units[0].occurrence_count, 1);
  assert.equal(sameSource.units[0].sources.length, 3);
});

test('CLI waits for the compile lock before reading Raw', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-llm-wiki-lock-'));
  const projectRoot = path.join(root, 'project');
  const feedbackPath = path.join(projectRoot, '.agents/project/memory/current/feedback-candidates.md');
  const registryPath = path.join(root, 'projects.json');
  const wikiDir = path.join(root, 'wiki');
  fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.writeFileSync(feedbackPath, ledgerEntry('old', '记录旧知识', '旧知识结论'));
  fs.writeFileSync(registryPath, `${JSON.stringify({ projects: [{ root: projectRoot }] })}\n`);
  const lockPath = path.join(wikiDir, '.compile.lock');
  fs.writeFileSync(lockPath, 'held');

  const script = fileURLToPath(new URL('./agent-llm-wiki.mjs', import.meta.url));
  const child = spawn(process.execPath, [
    script,
    'compile',
    '--knowledge-root', root,
    '--registry', registryPath,
    '--wiki-dir', wikiDir,
    '--include-temporary',
    '--json'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));

  await delay(150);
  fs.appendFileSync(feedbackPath, ledgerEntry('new', '记录锁释放后新增知识', '锁内重新读取后包含新知识'));
  fs.rmSync(lockPath, { force: true });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0, Buffer.concat(stderr).toString());
  assert.equal(JSON.parse(Buffer.concat(stdout).toString()).locked, false);
  assert.match(fs.readFileSync(path.join(wikiDir, 'index.md'), 'utf8'), /锁内重新读取后包含新知识/);

  fs.rmSync(root, { recursive: true, force: true });
});

function entry(overrides = {}) {
  return {
    id: 'entry',
    date: '2026-07-12',
    task: '有效知识任务',
    workflow: '知识系统治理',
    task_type: 'bug-fix',
    duration_minutes: '60',
    duration_source: 'manual',
    knowledge_level: 'K1',
    knowledge_used: 'yes',
    useful_sources: 'project/charter.md',
    missing_sources: 'none',
    decisions: 'pending-review',
    validation: 'none',
    reusable_asset: 'auto-candidate',
    reusable_output: 'auto-candidate',
    suggested_destination: 'none',
    next_update: 'none',
    confidence: 'low',
    sensitive: 'yes',
    agent_tool: 'codex',
    project_root: '/Users/luhonggang/Project/demo',
    project_name: 'demo',
    source_path: '/Users/luhonggang/Project/demo/.agents/project/memory/current/feedback-candidates.md',
    ...overrides
  };
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ledgerEntry(id, task, outcome) {
  return `\n<!-- knowledge-feedback-id: ${id} -->\n## 2026-07-12 - ${task}\n- workflow: test\n- task_type: regression\n- knowledge_level: K1\n- useful_sources: none\n- decisions: none\n- validation: none\n- reusable_asset: none\n- reusable_output: ${outcome}\n- confidence: low\n- sensitive: no\n`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
