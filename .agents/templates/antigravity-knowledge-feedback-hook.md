# Antigravity CLI 知识回流 Hook 模板

Antigravity CLI 接入知识回流时，不复制项目运行时脚本。当前本机使用命名 `Stop` Hook 调用全局 bridge：

```bash
AGENT_KNOWLEDGE_TOOL=antigravity /Users/luhonggang/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh --json-output
```

接入要求：

- 全局 bridge 优先使用 Hook 输入的 `workspacePaths[0]`；CLI print mode 传空数组时，从父进程启动目录定位项目，并以会话缓存作后备。
- 全局 bridge 负责初始化缺失的 `.agents` 并运行唯一受管 implementation。
- hook 只写 `.agents/project/memory/current/feedback-candidates.md`，不直接改个人知识库稳定页。

```json
{
  "knowledge-feedback": {
    "Stop": [
      {
        "type": "command",
        "command": "AGENT_KNOWLEDGE_TOOL=antigravity /Users/luhonggang/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh --json-output",
        "timeout": 60
      }
    ]
  }
}
```

配置文件：`~/.gemini/config/hooks.json`。依据：[Antigravity Hooks](https://www.antigravity.google/docs/hooks)。
