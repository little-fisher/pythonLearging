# 项目代码知识图谱

项目代码知识图谱用于让 Agent 快速找到“这个业务在哪里、被谁调用、改了会影响谁”。

Harness 的正式图谱后端是 `colbymchenry/codegraph`。它负责 `.codegraph/` 本地索引、MCP 工具和符号/调用关系查询；Harness 负责把 CodeGraph 状态、任务影响面和业务概念索引沉淀到 `.agents/project/graph/`。

## 第一性目标

项目图谱必须回答：

```text
本项目有哪些模块、路由、接口、业务概念、调用关系和高耦合点？
本次任务改动会影响哪些文件、模块和业务概念？
```

## 默认产物

```text
.agents/project/graph/
  codegraph-status.md          # CodeGraph CLI、MCP 和 .codegraph 状态
  codegraph-status.json
  codegraph-snapshot.md        # 本次快照、affected/explore 摘要
  codegraph-files.json         # CodeGraph 文件树快照（可用时）
  project-code-graph.json      # 机器可读图谱：文件、模块、imports、routes、apis、concepts、coupling
  project-code-graph.md        # 人类可读摘要：模块、耦合、影响面、建议
  business-knowledge.md        # 业务概念到文件、路由、接口的索引
```

## CodeGraph 安装

推荐通过 Harness 初始化器自动安装和接入：

```bash
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent
```

该命令默认会尝试全局安装 CodeGraph、执行 `codegraph install` 接入 Agent MCP，并执行项目级 `codegraph init`。如果环境不允许自动安装，可用 `--no-codegraph-install`；如果不允许修改 Agent MCP 配置，可用 `--no-codegraph-agent-install`；如果完全禁用 CodeGraph，可用 `--no-codegraph`。

手动全局安装 CodeGraph：

```bash
npm i -g @colbymchenry/codegraph
```

或按官方安装脚本安装。安装后接入 Agent：

```bash
codegraph install
```

`codegraph install` 会把 CodeGraph MCP server 接入 Claude Code、Codex CLI、OpenCode、Antigravity 等支持的工具。MCP server 命令为：

```bash
codegraph serve --mcp
```

## 项目初始化

项目接入 Harness 后，初始化器会自动生成项目画像和代码图谱。需要单独重建时运行：

```bash
node .agents/scripts/agent-project-profile.mjs --project-root "$PWD" --write
```

如果本机已有 `codegraph` 命令，重建会自动执行 CodeGraph 项目索引并创建 `.codegraph/`。如果还没安装 CodeGraph，可显式用 npx：

```bash
node .agents/scripts/agent-project-profile.mjs --project-root "$PWD" --write --use-npx
```

也可以单独初始化 CodeGraph：

```bash
node .agents/scripts/agent-codegraph.mjs init --project-root "$PWD" --write
```

也可以单独重建：

```bash
node .agents/scripts/agent-project-graph.mjs --project-root "$PWD" --write
```

`agent-project-graph.mjs` 会先调用 CodeGraph `sync/snapshot`，再生成业务概念索引和模块摘要。

## 任务结束回补

Stop hook 会在 `normal` / `complex` / `long` 任务结束后尝试执行：

```bash
node .agents/scripts/agent-project-graph.mjs --project-root "$PWD" --write --git-changes --no-codegraph --quiet
```

它只读取 git working tree 改动并刷新静态 `changed_files`、`impacted_files` 和 `impacted_modules`，不在任务结束热路径同步 CodeGraph。完整 CodeGraph `sync/snapshot` 由任务入口或显式图谱命令执行。

设置 `AGENT_PROJECT_GRAPH=0` 可关闭任务结束后的图谱回补。

## Agent 使用规则

- 开始做代码任务前，先读 `.agents/project/graph/project-code-graph.md` 和 `.agents/project/graph/business-knowledge.md`。
- 如果用户描述业务名、页面名、接口名，先从 `business-knowledge.md` 找概念对应文件。
- 修改前优先调用 CodeGraph MCP：`codegraph_explore`、`codegraph_search`、`codegraph_node`、`codegraph_callers`、`codegraph_callees`、`codegraph_impact`。
- 修改前查看高耦合文件、CodeGraph impact 和 impacted modules。
- 如果图谱缺失，`normal` 任务可继续但应提醒补建；`complex` / `long` 任务 SHOULD 先补建图谱。

## Harness 与 CodeGraph 分工

| 能力 | CodeGraph | Harness |
|---|---|---|
| `.codegraph/` 本地索引 | 负责 | 检查状态 |
| MCP 工具 | 负责 | 写调用规则 |
| 符号/调用链/影响面 | 负责 | 作为 evidence/gate 使用 |
| 业务概念到文件/路由/API | 原始图谱 | 整理为 `business-knowledge.md` |
| 任务结束回补 | auto-sync + sync | Stop hook 调用并沉淀快照 |
| 项目画像 | 提供代码事实 | 合并规范、设计、需求、API、记忆 |

结论：CodeGraph 是代码图谱引擎；Harness 把它变成项目画像、任务证据和 Agent 可执行入口。
