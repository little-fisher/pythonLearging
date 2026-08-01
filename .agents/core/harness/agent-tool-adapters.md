# Agent 工具适配层

本文档定义 Claude Code、Codex、OpenCode、Antigravity CLI 如何接入同一套项目知识入口和知识回流出口。

## 适配原则

- 核心规则只写一次：`.agents/AGENTS.md`、`core/harness/`、`core/validation/`。
- 核心脚本只写一次：`scripts/agent-context-pack.mjs`、`scripts/agent-knowledge-feedback.mjs`、`scripts/agent-knowledge-feedback-hook.mjs`、`scripts/agent-llm-wiki.mjs`。
- 工具差异只放在 adapter：`.claude/settings.json`、`.codex/hooks.json`、`.opencode/plugins/`、Antigravity hooks。
- Adapter 只传递生命周期；统一 bridge 追加 Raw 并编译机器 Wiki，不修改个人画像、全局规则或可执行 Schema。

## 统一生命周期

```text
SessionStart/UserPrompt
  -> 读取项目 AGENTS.md
  -> 按任务类型生成 context-pack
  -> Agent 执行任务并记录 evidence
Stop/session.idle/loop stop
  -> 调用 agent-knowledge-feedback-hook.mjs
  -> 写入 project/memory/current/feedback-candidates.md Raw Ledger
  -> 全局 bridge 调用 agent-llm-wiki.mjs compile
Monthly summary
  -> 调用 agent-knowledge-feedback.mjs summary
```

## 项目必备文件

```text
.agents/
  AGENTS.md
  core/harness/knowledge-feedback.md
  core/harness/agent-tool-adapters.md
  scripts/agent-context-pack.mjs
  scripts/agent-knowledge-feedback.mjs
  scripts/agent-knowledge-feedback-hook.mjs
  scripts/agent-llm-wiki.mjs
  hooks/scripts/knowledge-feedback-stop.sh
  project/memory/current/
  project/memory/monthly/
```

## Claude Code

使用 `.claude/settings.json` 的 Stop hook：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .agents/hooks/scripts/knowledge-feedback-stop.sh"
          }
        ]
      }
    ]
  }
}
```

## Codex

Codex 使用 `AGENTS.md` 作为指令入口，使用 `.codex/hooks.json` 接入 Stop hook：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .agents/hooks/scripts/knowledge-feedback-stop.sh",
            "statusMessage": "Writing knowledge feedback"
          }
        ]
      }
    ]
  }
}
```

如果项目还没有 `.codex/`，只需要创建 `.codex/hooks.json`；知识回流脚本仍然放在 `.agents/scripts/`。

## OpenCode

OpenCode 使用 `AGENTS.md` 或 `opencode.json` 的 `instructions` 字段加载规则：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": [".agents/AGENTS.md"]
}
```

OpenCode 默认使用用户级 `~/.config/opencode/plugins/knowledge-feedback.ts`。需要项目级覆盖时复用 `templates/opencode-knowledge-feedback-plugin.js`，不要绕过统一 bridge。SDK 1.3 的消息查询参数必须使用 `path/query`：

```js
const response = await client.session.messages({
  path: { id: event.properties.sessionID },
  query: { directory: projectRoot, limit: 20 }
});

// 提取最后一条 user / assistant 文本后，把 prompt + outcome 传给：
// ~/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh
```

`session.idle` 回调必须先做项目级节流，然后用 fire-and-forget 方式读取消息并 detached 分发 bridge；不要在事件回调中 `await` 消息查询或整条回流链。

保存到：

```text
templates/opencode-knowledge-feedback-plugin.js
```

## Antigravity CLI

Antigravity CLI 当前使用 `~/.gemini/config/hooks.json` 的命名 `Stop` Hook 调用全局 bridge：

```bash
AGENT_KNOWLEDGE_TOOL=antigravity /Users/luhonggang/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh --json-output
```

全局 bridge 优先解析 Hook 输入的 `workspacePaths[0]`。Antigravity CLI 的 print mode 可能传空数组，此时 bridge 从父进程启动目录定位项目，并以会话缓存作后备；当前结构见 `templates/antigravity-knowledge-feedback-hook.md`。

## 月度统计

所有工具都使用同一命令：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs summary --month "$(date +%Y-%m)"
```

自然语言触发词：

- "这个月的产出总结"
- "月度统计"
- "本月知识库价值"
- "这个月 Agent 做了什么"
- "这个月哪些知识被复用"
- "这个月缺哪些知识"

## 验收

接入一个新项目后，至少验证：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs --init
node .agents/scripts/agent-context-pack.mjs --task "验证知识回流接入" --write --agents-dir .agents
bash .agents/hooks/scripts/knowledge-feedback-stop.sh < /dev/null
node .agents/scripts/agent-knowledge-feedback.mjs summary --month "$(date +%Y-%m)"
```

成功标准：

- `feedback-candidates.md` 有 append-only Raw 记录。
- 月报文件生成。
- 机器 Wiki 能自动更新且 source refs 可追溯；个人画像和可执行 Schema 未被修改。
