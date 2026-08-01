import test from 'node:test';
import assert from 'node:assert/strict';

import { createKnowledgeFeedbackPlugin } from '../templates/opencode-knowledge-feedback-plugin.js';

test('OpenCode idle adapter returns immediately, throttles duplicate idle events and forwards the latest turn', async () => {
  const calls = [];
  const dispatches = [];
  let resolveMessages;
  const client = {
    session: {
      messages: async (options) => {
        calls.push(options);
        return new Promise((resolve) => {
          resolveMessages = () => resolve({
          data: [
            { info: { role: 'user' }, parts: [{ type: 'text', text: '完善自动 Wiki', synthetic: false }] },
            { info: { role: 'assistant' }, parts: [{ type: 'text', text: '已完成并通过测试', synthetic: false }] }
          ]
          });
        });
      }
    }
  };
  const plugin = await createKnowledgeFeedbackPlugin(
    { client, directory: '/tmp/opencode-project', worktree: '' },
    async (payload) => dispatches.push(payload)
  );

  const idle = { event: { type: 'session.idle', properties: { sessionID: 'session-123' } } };
  assert.equal(plugin.event(idle), undefined);
  assert.equal(plugin.event(idle), undefined);

  assert.deepEqual(calls, [{
    path: { id: 'session-123' },
    query: { directory: '/tmp/opencode-project', limit: 20 }
  }]);
  assert.deepEqual(dispatches, []);

  resolveMessages();
  await waitFor(() => dispatches.length === 1);
  assert.deepEqual(dispatches, [{
    projectRoot: '/tmp/opencode-project',
    sessionID: 'session-123',
    prompt: '完善自动 Wiki',
    outcome: '已完成并通过测试'
  }]);
});

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for async dispatch');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
