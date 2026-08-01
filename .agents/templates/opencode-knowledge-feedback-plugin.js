import { spawn } from 'node:child_process';

const bridge = `${process.env.HOME}/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh`;
const lastRunByProject = new Map();
const throttleMs = 20_000;

export const KnowledgeFeedbackPlugin = async ({ client, directory, worktree }) => {
  return createKnowledgeFeedbackPlugin({ client, directory, worktree });
};

export async function createKnowledgeFeedbackPlugin({ client, directory, worktree }, dispatch = dispatchBridge) {
  const projectRoot = worktree || directory || process.cwd();

  return {
    event: ({ event }) => {
      if (event.type !== "session.idle") return;
      const sessionID = event.properties.sessionID;
      const now = Date.now();
      const lastRun = lastRunByProject.get(projectRoot) || 0;
      if (now - lastRun < throttleMs) return;
      lastRunByProject.set(projectRoot, now);
      void collectAndDispatch({ client, dispatch, projectRoot, sessionID }).catch(() => {});
    }
  };
}

async function collectAndDispatch({ client, dispatch, projectRoot, sessionID }) {
  const response = await client.session.messages({
    path: { id: sessionID },
    query: { directory: projectRoot, limit: 20 }
  });
  const messages = response.data || [];
  const prompt = [...messages]
    .reverse()
    .find((message) => message.info.role === 'user')
    ?.parts.filter((part) => part.type === 'text' && !part.synthetic)
    .map((part) => part.text)
    .join('\n') || '';
  const outcome = [...messages]
    .reverse()
    .find((message) => message.info.role === 'assistant')
    ?.parts.filter((part) => part.type === 'text' && !part.synthetic)
    .map((part) => part.text)
    .join('\n') || '';
  await dispatch({ projectRoot, sessionID, prompt, outcome });
}

function dispatchBridge({ projectRoot, sessionID, prompt, outcome }) {
  const child = spawn('bash', [bridge, '--silent', '--project-root', projectRoot], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    env: { ...process.env, AGENT_KNOWLEDGE_TOOL: 'opencode' }
  });
  child.stdin?.end(JSON.stringify({ cwd: projectRoot, session_id: sessionID, prompt, outcome }));
  child.unref();
}
