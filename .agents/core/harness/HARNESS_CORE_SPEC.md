# Harness Core 约束规格

状态：草案，约束性规范。

本文件定义什么属于 Harness Core。它不是产品介绍、工具适配说明或记忆系统说明。当其他 Harness 文档与本文件冲突时，在用户明确修改本规格前，以本文件为准。

## 规范词

本文中的 `MUST`、`MUST NOT`、`SHOULD`、`SHOULD NOT`、`MAY` 为约束词。

- `MUST`：Harness Core 必须满足。
- `MUST NOT`：Harness Core 明确禁止。
- `SHOULD`：默认应该满足，除非有明确记录的例外。
- `MAY`：可选能力。

## 第一性目标

Harness Core 的第一性目标是约束并验证 Agent 的单次任务执行。

Harness Core MUST 回答一个问题：

```text
这次 Agent 任务是否在明确边界内执行，是否留下证据，是否经过评估，是否按规则关闭？
```

Harness Core MUST NOT 把多 Agent 协作、知识回流、记忆抽取或工具适配作为第一性目标。

## 非目标

Harness Core MUST NOT：

- 决定 Agent 如何编辑文件、写代码、调用工具或调用模型。
- 启动、代理或包裹 Agent CLI。
- 调度多个 Agent。
- 把知识候选晋级为稳定规则。
- 修改个人画像、全局提示词或项目稳定规则。
- 从最终回复文案推断任务已经成功。
- 把知识回流候选当成验证证据。

这些能力 MAY 存在于扩展层或编排层，但 MUST NOT 推进 Core run 状态。

## 系统分层

Harness 资产分为六层。

| 层 | 作用 | 是否能推进 Core run 状态 |
|---|---|---|
| Harness Core | 约束并验证一次任务执行 | 是 |
| Memory System | 从 closed run 中提取可复用事实和经验 | 否 |
| Self-Evolution System | 提出规则、模板、脚本或 skill 的升级建议 | 否 |
| Knowledge Feedback | 追加 Raw、编译机器 Wiki并生成月度影响统计 | 否 |
| Orchestration | 编排多个 Harness Run 或多个 Agent | 否 |
| Tool Adapters | 接入 Claude Code、Codex、OpenCode、Antigravity、hook 或 plugin | 否 |

只有 Harness Core MAY 拥有 run 状态转换权。

## Harness Run

Harness Run 是一次有边界的 Agent 任务执行。

Harness Core MUST 为所有非 `micro` 任务建模 run。

默认进入策略：

| 任务大小 | Harness Run 策略 |
|---|---|
| `micro` | 默认 MUST NOT 创建 run。最终回复说明范围、验证和风险。 |
| `normal` | SHOULD 创建轻量 run。必须包含任务、分级、范围、至少一条成功标准、证据、评估和关闭状态。 |
| `complex` | MUST 创建完整 run，包含上下文、契约、证据、Evaluator 报告和关闭结果。 |
| `long` | MUST 拆成多个阶段 run。长任务层 MAY 记录阶段关系，但 MUST NOT 变成一个无边界的大 run。 |

## Run 目录

默认 run 目录：

```text
.agents/project/harness/runs/<run-id>/
  run.json
  context-pack.md
  contract.json
  evidence.md
  evaluator-report.md
  outcome.md
```

Harness Core MAY 支持自定义路径，但每个自定义路径下仍然 MUST 有一个 `run.json` 作为机器可读权威事实源。

## 唯一事实源

`run.json` MUST 是 run 状态的唯一机器可读事实源。

Markdown 文件是人类可读附件。它们 MAY 解释上下文、证据、评估理由或最终结果，但 MUST NOT 定义当前 run 状态。

`run.json` 的最小结构：

```json
{
  "schema_version": "1.0",
  "run_id": "",
  "status": "draft",
  "task": {
    "title": "",
    "source_request": ""
  },
  "classification": {
    "size": "",
    "primary_type": "",
    "secondary_types": []
  },
  "scope": {
    "in": [],
    "out": [],
    "assumptions": []
  },
  "paths": {
    "context_pack": "context-pack.md",
    "contract": "contract.json",
    "evidence": "evidence.md",
    "evaluator_report": "evaluator-report.md",
    "outcome": "outcome.md"
  },
  "evaluator": {
    "decision": "pending",
    "report_path": ""
  },
  "quality_gates": [],
  "blockers": [],
  "transitions": []
}
```

后续 MAY 增加字段，但已有必需字段的含义 MUST 保持稳定。

## Run 状态

Harness Core 状态机：

```text
draft
  -> scoped
  -> running
  -> evidence_ready
  -> evaluated
  -> closed
```

状态含义：

| 状态 | 含义 |
|---|---|
| `draft` | 已记录用户任务，但任务分级、范围和成功标准尚未完整。 |
| `scoped` | 已完成任务分级、范围、成功标准和验证计划，足以开始执行。 |
| `running` | Agent 正在边界内执行，可追加 notes、decisions、risks 和实现细节。 |
| `evidence_ready` | 已存在证据，或已记录明确的 cannot-verify 原因。 |
| `evaluated` | Evaluator 结论已记录为 `pass`、`fail` 或 `blocked`。 |
| `closed` | run 以合法的 pass 或 blocked 结果结束。 |

## 状态转换规则

Harness Core MUST 强制执行以下转换：

| 转换 | 必需条件 |
|---|---|
| `draft -> scoped` | `task`、`classification`、`scope` 存在，且 `contract.json` 至少有一条 `success_criteria`。 |
| `scoped -> running` | 上下文存在，或已明确记录 `no_context_needed` 及理由。 |
| `running -> evidence_ready` | 至少有一条 evidence，或已记录 cannot-verify 原因。 |
| `evidence_ready -> evaluated` | Evaluator 结论是 `pass`、`fail` 或 `blocked`，且记录了报告路径；当结论为 `pass` 时，所有 required QA Gate 必须通过。 |
| `evaluated -> closed` | `pass` 可关闭；`blocked` 只有在记录 blocker 时可关闭；`fail` MUST NOT 关闭。 |
| `evaluated -> running` | 当结论为 `fail` 或需要补充证据时必须回到执行状态。 |

Harness Core MUST 拒绝静默跳状态。

Harness Core MUST 将每次状态变化追加到 `run.json.transitions`。

Harness Core MUST NOT 删除失败标准或失败证据来制造 pass。

## Contract

每个 `normal`、`complex` 和阶段级 `long` run MUST 至少有一条成功标准。

成功标准细节写入 `contract.json`。`run.json` 只记录状态和附件路径，不复制完整成功标准。

每条成功标准 MUST 包含：

- 稳定 id。
- 描述。
- required 标记。
- 验证方法或人工边界。
- 状态。
- 证据引用。

成功标准 MUST 可验证。诸如“体验更好”“尽量优化”这类模糊目标，MUST 转换为可观察标准，或移入非阻塞 notes。

## Evidence

Evidence 是证明某条标准已被检查的证据。

Evidence MAY 是：

- 命令输出摘要。
- 测试结果。
- 截图或产物路径。
- 人工验证步骤。
- 带边界和风险说明的 cannot-verify 原因。

Evidence MUST 说明检查了什么，以及观察到什么结果。

Evidence MUST NOT 被“已验证”这类无支撑的最终回复替代。

## QA Gate

QA Gate 是 Evidence 的强约束子集，用于 UI、Figma/设计还原、浏览器运行时、network、API/TS 契约等高风险验收。

Harness Core MUST 遵守：

- `micro` run MUST NOT 因 QA Gate 增加流程。
- `normal` run MAY 使用 QA Gate，但默认不强制。
- `complex` / `long` run 在命中页面绘制、Figma/设计截图、浏览器交互、后端接口、TS/API 契约时，SHOULD 写入 `run.json.quality_gates`。
- required QA Gate MUST 有 evidence 引用。
- required QA Gate 未通过时，Evaluator MUST NOT 给 `pass`。

QA Gate evidence MAY 来自 Playwright MCP、Playwright 脚本、浏览器 network/console、截图比对、接口 schema 校验或人工边界说明。

Harness Core MUST NOT 绑定具体 MCP 或浏览器实现；它只强制证据存在和 pass 闸口。

## Evaluation

第一版 Harness Core 的 evaluation 是结构化记录，不是智能评审。

`evaluate` MUST：

- 要求当前状态为 `evidence_ready`。
- 要求结论为 `pass`、`fail` 或 `blocked`。
- 要求 evaluator report 路径或报告正文。
- 写入 `evaluator-report.md`。
- 同步 `run.json.evaluator.decision`。
- 将状态推进为 `evaluated`。

第一版 Harness Core evaluation MUST NOT：

- 调用 LLM。
- 自动检查源码。
- 自动运行测试。
- 自行判断实现质量。

模型评估 MAY 后续作为 extension 加入，但它 MUST 写入普通 evaluator report，且 MUST NOT 绕过 Core 状态转换规则。

## Close

`close` MUST：

- 要求当前状态为 `evaluated`。
- 允许 `pass` 关闭。
- 允许 `blocked` 在记录 blockers 后关闭。
- 拒绝 `fail` 关闭。
- 写入 `outcome.md`。
- 将最终转换追加到 `run.json.transitions`。

`close` MUST NOT 从聊天结束、final 回复或工具会话结束中推断。

## 最小 CLI

Harness Core SHOULD 提供最小运行时 CLI：

```bash
node .agents/scripts/harness-run.mjs start --task "用户原始需求"
node .agents/scripts/harness-run.mjs scope --run-id <id>
node .agents/scripts/harness-run.mjs evidence --run-id <id> --validation "..." --result "..."
node .agents/scripts/harness-run.mjs evaluate --run-id <id> --decision pass|fail|blocked
node .agents/scripts/harness-run.mjs close --run-id <id>
node .agents/scripts/harness-run.mjs status --run-id <id>
```

CLI MUST 管理 `run.json` 状态转换。CLI MAY 生成或更新 Markdown 附件。

第一版 Core CLI MUST NOT 启动 Agent 进程。

## Closed-Run 扩展

扩展 MUST 读取 closed 或 evaluated run 产物。扩展 MUST NOT 推进 Core 状态。

### Memory System

Memory extraction MAY 在 run closed 后执行。

它 MAY 产出：

- 项目事实。
- 可复用决策。
- 已验证坑点。
- 候选规则。
- 模块 playbook 更新建议。

它 MUST NOT 自动修改稳定 Core 规则。

### Self-Evolution System

Self-evolution MAY 分析多个 runs、memory entries、失败评估或重复 blockers。

它 MAY 为以下对象生成升级提案：

- 规则。
- 模板。
- 脚本。
- skills。
- 验证检查。

它修改稳定 Core 规则前 MUST 经过人工确认。

### Knowledge Feedback

Knowledge Feedback MUST 是 closed-run extension。

它 SHOULD 读取：

- `run.json`
- `contract.json`
- `evidence.md`
- `evaluator-report.md`
- `outcome.md`

当不存在有效 run 时，它 MUST NOT 使用 transcript fallback 自动写入 feedback candidates。

它 MUST NOT 判断 run 是否通过。

### Orchestration

Orchestration MAY 编排多个 Harness Runs。

多 Agent dispatch MUST 被视为多个 runs 之上的编排，而不是 Harness Run 的替代物。

### Tool Adapters

Tool adapters MAY 在工具生命周期事件中调用 Core CLI。

Adapters MUST NOT 在工具专属 hook 中复制 Core 状态逻辑。

## 现有资产归类

当前资产按以下方式归类。

### Core

- `core/harness/task-intake.md`
- `core/harness/task-routing.md`
- `core/harness/context-pack.md`
- `core/harness/project-initialization.md`
- `core/harness/project-graph.md`
- `core/harness/task-contract.md`
- `core/harness/evaluator.md`
- `core/validation/done-definition.md`
- `core/validation/evidence-report.md`
- `core/validation/playwright-recipes.md`
- `core/validation/qa-gates.md`
- `core/validation/test-matrix.md`
- `core/templates/task-contract.json`
- `core/templates/evaluator-report.md`
- `core/templates/validation-report.md`
- `scripts/agent-context-pack.mjs`
- `scripts/agent-codegraph.mjs`
- `scripts/agent-project-profile.mjs`
- `scripts/agent-project-graph.mjs`
- `scripts/agent-harness-verify.mjs`

### Core Runtime

- `scripts/harness-run.mjs`
- `core/templates/run.json`

### Memory 与 Evolution 扩展

- `core/memory/realtime-memory.md`
- `core/harness/experience-extraction.md`
- future `core/memory/run-memory.md`
- future `core/evolution/evolution-policy.md`
- future `scripts/harness-memory.mjs`
- future `scripts/harness-evolve.mjs`

### Knowledge Feedback 扩展

- `core/harness/knowledge-feedback.md`
- `core/templates/knowledge-feedback.md`
- `core/templates/knowledge-impact.md`
- `scripts/agent-knowledge-feedback.mjs`
- `scripts/agent-knowledge-feedback-hook.mjs`
- `hooks/scripts/knowledge-feedback-stop.sh`

### Orchestration

- `core/harness/multi-agent-dispatch.md`
- `core/harness/long-task-orchestration.md`
- `scripts/agentctl.mjs`

### Tool Adapters

- `core/harness/agent-tool-adapters.md`
- `templates/claude-settings-knowledge-feedback.json`
- `templates/codex-hooks-knowledge-feedback.json`
- `templates/opencode-knowledge-feedback-plugin.js`
- `templates/antigravity-knowledge-feedback-hook.md`

### Standards 与支撑材料

- `core/standards/code-generation.md`
- `core/standards/comments-and-fields.md`
- `core/standards/eslint.md`
- `core/templates/code-review-checklist.md`
- `core/templates/complex-task-breakdown.md`
- `core/templates/experience-report.md`
- `core/tools/obsidian.md`

## 迁移护栏

第一轮迁移 MUST NOT 删除现有可工作的资产。

第一轮迁移 MUST 保留旧路径作为兼容入口，直到 `README.md`、`AGENTS.md`、`index.md` 和项目初始化器更新完成。

迁移 MUST 先把 Knowledge Feedback 从 Core 叙事中降级，再继续增加新的编排功能。

迁移 MUST 保持 `scripts/harness-run.mjs` 和 `core/templates/run.json` 通过结构校验，才能声称 Harness Core 已经可执行。

迁移 MUST 让 transcript fallback 通过真实任务/最终结果提取、去噪、脱敏和 adapter 回归测试，之后才能把 feedback 数据视为可靠来源。

迁移 SHOULD 在本规格被活跃入口引用后，再引入 `core/extensions/` 和 `core/orchestration/`。

迁移 SHOULD 保持每一步都能通过 `scripts/agent-harness-verify.mjs` 验证。

## 合规检查清单

未来任何声称修改 Harness Core 的变更，都必须回答：

- 是否保留 `run.json` 作为唯一机器可读状态源？
- 是否保持状态转换规则？
- 是否区分 Core、Memory、Evolution、Feedback、Orchestration 和 Adapters？
- 是否避免在 Core 中启动或代理 Agent CLI？
- 是否要求 evaluation 前必须有 evidence？
- 是否要求 required QA Gate 未通过时不能 pass？
- 是否拒绝 fail run 关闭？
- 是否保留稳定规则变更的人工确认权？

如果任一答案为否，该变更应归入 Core 之外，或必须由用户明确批准修改本规格。
