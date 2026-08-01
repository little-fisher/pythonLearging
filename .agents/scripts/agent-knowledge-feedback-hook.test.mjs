import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildWikiProjection } from './agent-llm-wiki.mjs';
import { parseFeedbackEntries } from './knowledge-feedback-quality.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const hookScript = path.join(scriptsDir, 'agent-knowledge-feedback-hook.mjs');

test('hook rejects noise, redacts sensitive text, caps auto score and dedupes adapters', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-feedback-'));
  const agentsDir = path.join(projectRoot, '.agents');
  const transcriptPath = path.join(projectRoot, 'transcript.jsonl');
  const task = '修复上海示例科技有限公司合同列表 13812345678 sk-abcdefghijkl 重复请求';
  fs.writeFileSync(transcriptPath, [
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: task } }),
    JSON.stringify({ type: 'tool_result', content: 'x'.repeat(70000) }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '统一请求锁已解决重复请求，password=hunter2，pnpm test 已通过。' }] } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_tokens: 999999 } } })
  ].join('\n'));

  for (const sessionId of ['codex-session', 'claude-session']) {
    const result = spawnSync(process.execPath, [
      hookScript,
      '--project-root', projectRoot,
      '--agents-dir', agentsDir
    ], {
      input: JSON.stringify({ cwd: projectRoot, transcript_path: transcriptPath, session_id: sessionId }),
      encoding: 'utf8',
      env: { ...process.env, AGENT_KNOWLEDGE_TOOL: sessionId.split('-')[0] }
    });
    assert.equal(result.status, 0, result.stderr);
  }

  const feedbackPath = path.join(agentsDir, 'project/memory/current/feedback-candidates.md');
  const feedback = fs.readFileSync(feedbackPath, 'utf8');
  assert.equal((feedback.match(/knowledge-feedback-id:/g) || []).length, 1);
  assert.match(feedback, /knowledge_level: K0/);
  assert.match(feedback, /sensitive: yes/);
  assert.match(feedback, /reusable_output: 统一请求锁已解决重复请求，password=\[密钥\]，pnpm test 已通过。/);
  assert.doesNotMatch(feedback, /total_tokens|13812345678|sk-abcdefghijkl|上海示例科技有限公司/);
  assert.doesNotMatch(feedback, /hunter2/);
  assert.equal(fs.existsSync(path.join(agentsDir, 'project/graph/project-code-graph.json')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, '.codegraph')), false);

  fs.writeFileSync(transcriptPath, [
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: task } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '第二轮改为共享请求状态，并通过 pnpm test。' }] } })
  ].join('\n'));
  const evolved = spawnSync(process.execPath, [hookScript, '--project-root', projectRoot, '--agents-dir', agentsDir], {
    input: JSON.stringify({ cwd: projectRoot, transcript_path: transcriptPath, session_id: 'codex-session' }),
    encoding: 'utf8',
    env: { ...process.env, AGENT_KNOWLEDGE_TOOL: 'codex' }
  });
  assert.equal(evolved.status, 0, evolved.stderr);
  const evolvedFeedback = fs.readFileSync(feedbackPath, 'utf8');
  assert.equal((evolvedFeedback.match(/knowledge-feedback-id:/g) || []).length, 2);
  assert.match(evolvedFeedback, /reusable_output: 第二轮改为共享请求状态，并通过 pnpm test。/);
  const projection = buildWikiProjection(parseFeedbackEntries(evolvedFeedback).map((entry) => ({
    ...entry,
    project_root: projectRoot,
    project_name: 'test-project',
    source_path: feedbackPath
  })));
  const unit = projection.units.find((item) => item.task.includes('合同列表'));
  assert.equal(unit.synthesis, '第二轮改为共享请求状态，并通过 pnpm test。');
  assert.equal(unit.needs_reconcile, true);
  assert.equal(unit.occurrence_count, 1);
  assert.equal(unit.variants.length, 2);

  fs.writeFileSync(transcriptPath, JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '继续' } }));
  const skipped = spawnSync(process.execPath, [hookScript, '--project-root', projectRoot, '--agents-dir', agentsDir], {
    input: JSON.stringify({ cwd: projectRoot, transcript_path: transcriptPath }),
    encoding: 'utf8',
    env: { ...process.env }
  });
  assert.match(skipped.stdout, /skipped: no meaningful user task/);
  assert.equal((fs.readFileSync(feedbackPath, 'utf8').match(/knowledge-feedback-id:/g) || []).length, 2);
});
