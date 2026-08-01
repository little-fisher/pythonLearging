# 多 Agent 发布、调度、回收与 Review

本文档定义 Claude Code、Codex、OpenCode、Antigravity CLI 在同一个项目里协作时的运行协议。目标是让用户可以在任意 Agent CLI 中发布任务，再由统一调度器拆分、启动、回收和评审，而不是让某个 Agent 私下调用另一个 Agent。

## 角色分工

| 角色 | 工具 | 默认职责 |
|---|---|---|
| Planner / Reviewer | Claude Code | 任务规划、方案设计、风险审查、最终 Review |
| Complex Developer | Codex | 复杂功能、跨文件实现、核心逻辑和主力开发 |
| Support Developer | OpenCode | 日常功能、小修复、测试补齐、文档和副手任务 |
| UI Builder | Antigravity CLI | 前端页面绘制、视觉实现、交互和设计类任务 |

Claude Code 不应该长期占用额度做全部实现；Codex / OpenCode / Antigravity 也不应该绕过调度器互相递归调用。

## 统一入口

所有多 Agent 任务使用：

```bash
agentctl publish --task "用户任务"
agentctl dispatch --run-id <run-id> --ghostty
agentctl collect --run-id <run-id>
agentctl review --run-id <run-id>
agentctl cleanup --run-id <run-id>
```

如果当前项目没有全局 PATH，可直接使用：

```bash
node .agents/scripts/agentctl.mjs publish --task "用户任务"
```

## 运行目录

每次发布任务会创建：

```text
.agents/project/runs/<run-id>/
  task-contract.md
  plan.md
  state.json
  events.jsonl
  work-orders/
  results/
  reviews/
  logs/
  patches/
  delegation-requests/
```

`state.json` 是唯一运行态事实源。Agent 不要自行维护另一套任务状态。

## 获取 Run ID

`agentctl publish` 的第一行会输出 Run ID：

```text
agentctl publish: 20260614-213000
```

也可以查询最近任务：

```bash
agentctl list
agentctl latest
```

Run ID 对应目录：

```text
.agents/project/runs/<run-id>/
```

## 发布任务

当用户说“发布任务”、“分给 Codex 做”、“多 Agent 并行”、“让 OpenCode 修一下”、“让 Antigravity 画前端页面”等，当前 Agent 应调用 `agentctl publish`。

示例：

```bash
agentctl publish \
  --task "实现告警列表筛选，Codex 做复杂逻辑，OpenCode 补测试，Antigravity 看前端交互" \
  --workers codex-main,opencode-support,antigravity-ui
```

没有指定 `--workers` 时，`agentctl` 会按任务关键词自动选择：

- 复杂 / 跨文件 / 工程化 / 核心功能：`codex-main`
- bug / 日常 / 测试 / 文档 / 小任务：`opencode-support`
- 前端 / 页面 / 绘制 / UI / 视觉 / 交互：`antigravity-ui`

## 调度执行

在 Ghostty 中打开四面板：

```bash
agentctl dispatch --run-id <run-id> --ghostty
```

Ghostty 面板建议：

- 左上：Codex 或第一个 worker
- 右上：OpenCode 或第二个 worker
- 左下：Antigravity 或第三个 worker
- 右下：`agentctl watch`

如果不想打开 Ghostty，只查看命令：

```bash
agentctl dispatch --run-id <run-id> --dry-run
```

无真实模型消耗的回归验证：

```bash
agentctl dispatch --run-id <run-id> --mode mock --execute
```

真实 CLI 命令适配默认值：

| Agent | 默认命令 | 覆盖环境变量 |
|---|---|---|
| Codex | `codex exec -C <workdir> --json -o <result> -` | `AGENTCTL_CODEX_CMD` |
| Claude Code | `claude -p --output-format json` | `AGENTCTL_CLAUDE_CMD` |
| OpenCode | `opencode run --dir <workdir> --format json` | `AGENTCTL_OPENCODE_CMD` |
| Antigravity | `agy -p` / `antigravity -p` / `gemini -p` 自动探测 | `AGENTCTL_ANTIGRAVITY_CMD` |

覆盖命令支持占位符：

```bash
AGENTCTL_CODEX_CMD="codex exec -C {workdir} --json -o {result} -" agentctl dispatch --run-id <run-id> --execute
```

## 防止并发改同一文件

默认隔离策略：

```text
auto -> Git 项目使用 worktree；非 Git 项目使用 lock
```

### Git worktree

在 Git 项目中，`agentctl` 会为 worker 创建独立 worktree：

```text
../<project>.agent-worktrees/<run-id>/<worker-id>
```

完成后必须运行：

```bash
agentctl cleanup --run-id <run-id>
```

该命令会移除 worktree，避免项目旁边积累临时目录。

### 文件锁

非 Git 项目或显式 `--isolation lock` 时，锁文件位于：

```text
.agents/project/agentctl-locks.json
```

worker 只能在 work order 的 `Scope Paths` 内工作。跨 scope 需求必须先发起 delegation，不允许直接改。

## Agent 请求其他 Agent

Agent 不直接启动另一个 Agent。需要更多帮助时，只能创建受控请求：

```bash
agentctl delegate \
  --run-id <run-id> \
  --from-worker codex-main \
  --to opencode \
  --task "为刚才改动补充单元测试" \
  --paths "tests/**,src/**/*.spec.*"
```

默认最大 delegation 深度为 1，避免 Agent A 调 B、B 又调 C 的递归失控。

## 回收结果

每个 worker 必须产出：

```text
results/<worker-id>.result.md
```

格式：

```text
# Agent Result

- status: done / blocked / failed
- worker_id:
- agent:
- changed_files:
- validation:
- evidence:
- risks:
- next_steps:
```

回收命令：

```bash
agentctl collect --run-id <run-id>
```

它会生成：

```text
collector-report.md
```

## Review

谁实现，谁不能最终批准。默认 Review 规则：

- Codex 产物优先由 Claude Code review。
- OpenCode 产物由 Codex 或 Claude Code review。
- Antigravity 产物需要截图、Playwright 或视觉证据，再由 Claude / Codex review。
- Claude 额度不足时，先用 `agentctl review --mode rule` 做结构化门禁，再交给用户人工确认。

命令：

```bash
agentctl review --run-id <run-id>
```

需要真实 Claude 审查时：

```bash
agentctl review --run-id <run-id> --mode real
```

## QA 回归

调度器自身回归验证：

```bash
agentctl qa
```

该命令使用 mock worker，不调用真实模型，验证：

- publish 生成任务契约、计划、work order 和 state。
- dispatch 能启动 worker-run。
- collect 能回收结果。
- review 能给出 PASS / REWORK。
- cleanup 能释放 lock / worktree。
- metrics 能输出耗时与 token 估算对比。

## 完成标准

一次多 Agent 任务完成必须同时满足：

- `collector-report.md` 没有 missing worker。
- `reviews/*.md` 的 decision 为 `PASS`。
- `metrics.md` 记录耗时和 token 对比。
- `agentctl cleanup --run-id <run-id>` 已执行或有明确保留 worktree 的理由。
- 需要沉淀时，按 `core/harness/knowledge-feedback.md` 追加 Raw，由统一 bridge 编译机器 Wiki。
