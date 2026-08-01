import test from 'node:test';
import assert from 'node:assert/strict';

import {
  effectiveKnowledgeLevel,
  extractOutcomeFromHookInput,
  extractOutcomeFromTranscript,
  extractTaskFromTranscript,
  hasStrongValidation,
  inspectFeedbackEntries,
  isKnowledgeBearingEntry,
  isUsableTask,
  isVerifiedImpact,
  parseFeedbackEntries,
  redactSensitiveText,
  semanticTaskKey
} from './knowledge-feedback-quality.mjs';

test('extracts the last real user task and ignores later telemetry', () => {
  const transcript = [
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '修复合同列表分页重复请求' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_tokens: 123456 } } })
  ].join('\n');

  assert.deepEqual(extractTaskFromTranscript(transcript), {
    seen: true,
    task: '修复合同列表分页重复请求'
  });
});

test('extracts Antigravity USER_INPUT records', () => {
  const transcript = [
    JSON.stringify({
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      content: '<USER_REQUEST>完善知识库自动复利编译链路</USER_REQUEST><ADDITIONAL_METADATA>cwd=/Users/example/private</ADDITIONAL_METADATA>'
    }),
    JSON.stringify({ type: 'PLANNER_RESPONSE', source: 'MODEL', status: 'DONE', content: '已完成实现并通过测试。' })
  ].join('\n');

  assert.deepEqual(extractTaskFromTranscript(transcript), {
    seen: true,
    task: '完善知识库自动复利编译链路'
  });
  assert.deepEqual(extractOutcomeFromTranscript(transcript), {
    seen: true,
    outcome: '已完成实现并通过测试。'
  });
});

test('extracts the final assistant outcome across adapters and ignores host errors', () => {
  const transcript = [
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已修复分页重复请求，并通过 pnpm test 验证。' }] } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_tokens: 123456 } } })
  ].join('\n');
  assert.deepEqual(extractOutcomeFromTranscript(transcript), {
    seen: true,
    outcome: '已修复分页重复请求，并通过 pnpm test 验证。'
  });
  assert.deepEqual(extractOutcomeFromTranscript(JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] }
  })), { seen: true, outcome: '' });
  assert.deepEqual(extractOutcomeFromHookInput({ outcome: '输出包含 password=hunter2 和 Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==' }), {
    seen: true,
    outcome: '输出包含 password=[密钥] 和 Basic [密钥]'
  });
});

test('rejects telemetry, placeholders and continuation-only prompts', () => {
  assert.equal(isUsableTask('"total_tokens":123,"model_context_window":258400'), false);
  assert.equal(isUsableTask('e","description":"Rename a Codex thread","inputSchema":{"type":"object","properties":{}}'), false);
  assert.equal(isUsableTask('temp user cleaned files cleaned'), false);
  assert.equal(isUsableTask('# Files mentioned by the user:'), false);
  assert.equal(isUsableTask('继续'), false);
  assert.equal(isUsableTask('修复地图时间轴定位错位'), true);
});

test('redacts secrets, personal paths, phone numbers and organization names', () => {
  const result = redactSensitiveText('上海示例科技有限公司 13812345678 sk-abcdefghijkl AKIA1234567890ABCDEF password=hunter2 Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ== /Users/luhonggang/a.txt');

  assert.equal(result.sensitive, true);
  assert.equal(result.text.includes('上海示例科技有限公司'), false);
  assert.equal(result.text.includes('13812345678'), false);
  assert.equal(result.text.includes('sk-abcdefghijkl'), false);
  assert.equal(result.text.includes('AKIA1234567890ABCDEF'), false);
  assert.equal(result.text.includes('hunter2'), false);
  assert.equal(result.text.includes('QWxhZGRpbjpvcGVuIHNlc2FtZQ=='), false);
  assert.equal(result.text.includes('/Users/luhonggang'), false);
});

test('caps automatic impact at K1 and preserves reviewed impact', () => {
  assert.equal(effectiveKnowledgeLevel({
    knowledge_level: 'K3',
    confidence: 'medium',
    reusable_output: 'auto-candidate',
    useful_sources: 'project/charter.md'
  }), 'K1');

  assert.equal(effectiveKnowledgeLevel({
    knowledge_level: 'K3',
    confidence: 'high',
    reusable_output: '场景专题',
    validation: 'pnpm test passed',
    useful_sources: '前端技术沉淀/场景专题/地图.md'
  }), 'K3');

  assert.equal(isVerifiedImpact({
    knowledge_level: 'K3',
    confidence: 'high',
    reusable_output: '场景专题',
    validation: 'none',
    useful_sources: '前端技术沉淀/场景专题/地图.md'
  }), false);
  assert.equal(isVerifiedImpact({
    knowledge_level: 'K3',
    confidence: 'high',
    reusable_output: '场景专题',
    validation: 'pnpm test passed',
    useful_sources: '前端技术沉淀/场景专题/地图.md'
  }), true);
  assert.equal(hasStrongValidation('abcdefgh'), false);
  assert.equal(hasStrongValidation('node --test 全部通过'), true);
  assert.equal(isKnowledgeBearingEntry({ reusable_output: 'auto-candidate', decisions: 'pending-review' }), false);
  assert.equal(isKnowledgeBearingEntry({ reusable_output: '使用共享请求锁避免分页重复请求' }), true);
});

test('builds the same semantic key across punctuation-only variations', () => {
  assert.equal(
    semanticTaskKey('修复：合同列表分页重复请求'),
    semanticTaskKey('修复 合同列表分页重复请求。')
  );
});

test('ledger inspection filters noise and keeps the strongest semantic duplicate', () => {
  const text = `
<!-- knowledge-feedback-id: a -->
## 2026-07-12 - 修复合同列表分页
- confidence: low
- knowledge_level: K3
- useful_sources: project/charter.md
- reusable_output: auto-candidate

<!-- knowledge-feedback-id: b -->
## 2026-07-12 - 修复：合同列表分页。
- confidence: high
- knowledge_level: K2
- useful_sources: project/charter.md
- validation: pnpm test passed
- reusable_asset: 分页场景
- suggested_destination: project/modules/contracts.md

<!-- knowledge-feedback-id: c -->
## 2026-07-12 - "total_tokens":999
`;
  const inspected = inspectFeedbackEntries(parseFeedbackEntries(text).map((entry) => ({
    ...entry,
    project_root: '/tmp/demo'
  })));

  assert.equal(inspected.entries.length, 1);
  assert.equal(inspected.entries[0].id, 'b');
  assert.equal(inspected.entries[0].knowledge_level, 'K2');
  assert.equal(inspected.noiseCount, 1);
  assert.equal(inspected.duplicateCount, 1);
});

test('ledger inspection keeps the latest source when task and knowledge are identical', () => {
  const text = `
<!-- knowledge-feedback-id: first -->
## 2026-07-12 - 完善自动 Wiki 编译
- confidence: low
- knowledge_level: K1
- reusable_output: 同一结论更新索引与日志

<!-- knowledge-feedback-id: second -->
## 2026-07-12 - 完善自动 Wiki 编译
- confidence: low
- knowledge_level: K1
- reusable_output: 同一结论更新索引与日志
`;
  const inspected = inspectFeedbackEntries(parseFeedbackEntries(text).map((entry) => ({
    ...entry,
    project_root: '/Project/demo'
  })));
  assert.equal(inspected.entries.length, 1);
  assert.equal(inspected.entries[0].id, 'second');
  assert.equal(inspected.entries[0].reusable_output, '同一结论更新索引与日志');
});

test('ledger inspection redacts every knowledge field and preserves full ids', () => {
  const text = `
<!-- knowledge-feedback-id: source-id-with-hyphens -->
## 2026-07-12 - 修复合同导出
- confidence: high
- knowledge_level: K2
- useful_sources: project/charter.md
- decisions: password=hunter2
- validation: curl 验证通过 Bearer abcdefghijklmnop
- reusable_asset: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==
- reusable_output: 使用统一导出队列
- workflow: password=hunter2
- task_type: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==
`;
  const inspected = inspectFeedbackEntries(parseFeedbackEntries(text));
  assert.equal(inspected.entries[0].id, 'source-id-with-hyphens');
  assert.doesNotMatch(JSON.stringify(inspected.entries[0]), /hunter2|abcdefghijklmnop|QWxhZGRpbjpvcGVuIHNlc2FtZQ==/);
});
