# 通用 AI 工程化模板

本模板用于新项目初始化 AI 工程化规则。默认安装到项目根目录的 `.agents/`；如果团队选择把 Agent 工程放在仓库外，请在项目根 `AGENTS.md` 中写清真实相对路径。

## 推荐结构

- `.agents/core/`：通用规则，直接复用本目录的 `core/`。
- `.agents/project/`：项目专属规则，按实际业务补充。
- `.agents/project/context-pack.config.json`：项目上下文包覆盖配置，用于自动选择项目文档和预算。
- `.agents/project/project-profile.md`：项目初始化识别结果，记录技术栈、代码规范、设计规范、需求、API 契约和记忆入口。
- `.agents/project/graph/`：基于 CodeGraph 的项目代码知识图谱，记录模块、路由、接口、业务概念、调用/依赖关系和耦合影响面。
- `.agents/project/memory/current/`：当前任务状态板。
- `.agents/project/memory/current/contract.json`：复杂任务的当前任务契约，按需从 `core/templates/task-contract.json` 复制。
- `.agents/project/memory/current/feedback-candidates.md`：兼容旧文件名的 append-only 知识 Raw Ledger，由 `scripts/agent-knowledge-feedback.mjs` 写入。
- `.agents/project/runs/<run-id>/`：多 Agent 发布、调度、回收、Review 的运行态目录，由 `scripts/agentctl.mjs` 管理。
- 项目根 `AGENTS.md`：只保留短入口，指向 `.agents/AGENTS.md`。

## 接入步骤

1. 仅在长期维护项目首次接入时运行 `/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent`；`micro / normal`、一次性目录和临时 workspace 不自动铺设完整 Harness。
2. 如果环境不允许自动安装 CodeGraph，用 `--no-codegraph-install`；如果不允许改 Agent MCP 配置，用 `--no-codegraph-agent-install`；如果完全禁用 CodeGraph，用 `--no-codegraph`。
3. 按项目实际情况创建 `project/charter.md`、`project/task-routing-overrides.md`、`project/architecture/`、`project/domains/` 和 `project/modules/`。
4. 把工具适配文件保持为短入口，不复制长规则。
5. 新项目或已开发大半的项目，如需重建画像，运行 `scripts/agent-project-profile.mjs --write`；如需重建 CodeGraph，运行 `scripts/agent-codegraph.mjs init --write`。
6. 按项目实际业务创建或校准 `project/context-pack.config.json`，让 `scripts/agent-context-pack.mjs` 能自动选择该读的项目文档。
7. 按项目验证命令更新 `core/validation/test-matrix.md` 或项目覆盖文档；涉及 UI、Figma、network、API/TS 契约的复杂任务，按 `core/validation/qa-gates.md` 登记 QA Gate。
8. 对跨模块、运行时交互或长任务，使用 `core/harness/task-intake.md`、`core/harness/task-contract.md` 和 `core/harness/evaluator.md` 建立实现-评估闭环。
9. 对需要 Claude Code / Codex / OpenCode / Antigravity 并行协作的任务，先读 `core/harness/multi-agent-dispatch.md`，通过 `scripts/agentctl.mjs` 发布、调度、回收、Review 和 cleanup。
10. 把 `scripts/agent-codegraph.mjs`、`scripts/agent-project-profile.mjs`、`scripts/agent-project-graph.mjs`、`scripts/agent-context-pack.mjs`、`scripts/agent-knowledge-feedback.mjs`、`scripts/agent-llm-wiki.mjs`、`scripts/agent-harness-verify.mjs` 和 `scripts/agentctl.mjs` 接入项目验证命令，分别作为 CodeGraph 管理、项目初始化识别、代码知识图谱、上下文入口、知识 Raw 落盘、机器 Wiki 编译、规则校验和多 Agent 调度入口。
11. 如使用 Claude Code，把 `hooks/scripts/knowledge-feedback-stop.sh` 接入 `.claude/settings.json` 的 `Stop` hook（出口自动回流），把 `hooks/scripts/context-pack-start.sh` 接入 `UserPromptSubmit` hook（入口自动生成上下文包，`micro` 任务静默跳过）；参考 `templates/claude-settings-knowledge-feedback.json` 和 `templates/claude-settings-context-pack.json`。
12. 如使用 Codex / OpenCode / Antigravity CLI，按 `core/harness/agent-tool-adapters.md` 复制对应 adapter 模板，只接入生命周期事件，不复制核心规则。

## 常用入口

- Harness Core 约束规格：`core/harness/HARNESS_CORE_SPEC.md`
- Harness Core 入口：`core/harness/README.md`
- 任务入口分级：`core/harness/task-intake.md`
- 任务路由：`core/harness/task-routing.md`
- 上下文包：`core/harness/context-pack.md`
- 项目初始化识别：`core/harness/project-initialization.md`
- 项目代码知识图谱：`core/harness/project-graph.md`
- 工具能力矩阵：`core/harness/tool-capability-matrix.md`
- 成本预算：`core/harness/cost-budget.md`
- QA Gate：`core/validation/qa-gates.md`
- 经验抽取：`core/harness/experience-extraction.md`
- 知识回流与价值评估：`core/harness/knowledge-feedback.md`
- Agent 工具适配层：`core/harness/agent-tool-adapters.md`
- 长任务编排：`core/harness/long-task-orchestration.md`
- 多 Agent 调度：`core/harness/multi-agent-dispatch.md`
- 任务契约：`core/harness/task-contract.md`
- Evaluator：`core/harness/evaluator.md`
- CodeGraph 管理脚本：`scripts/agent-codegraph.mjs`
- 项目画像脚本：`scripts/agent-project-profile.mjs`
- 项目代码图谱脚本：`scripts/agent-project-graph.mjs`
- 上下文包脚本：`scripts/agent-context-pack.mjs`
- Harness Run 状态机脚本：`scripts/harness-run.mjs`
- 知识回流脚本：`scripts/agent-knowledge-feedback.mjs`
- 知识回流质量闸口：`scripts/knowledge-feedback-quality.mjs`
- LLM Wiki 编译器：`scripts/agent-llm-wiki.mjs`
- 多 Agent 调度脚本：`scripts/agentctl.mjs`
- 知识回流 Stop Hook：`hooks/scripts/knowledge-feedback-stop.sh`
- 上下文包 UserPromptSubmit Hook：`hooks/scripts/context-pack-start.sh`
- Claude Code Stop Hook 示例：`templates/claude-settings-knowledge-feedback.json`
- Claude Code UserPromptSubmit Hook 示例：`templates/claude-settings-context-pack.json`
- Codex Hook 示例：`templates/codex-hooks-knowledge-feedback.json`
- OpenCode Plugin 示例：`templates/opencode-knowledge-feedback-plugin.js`
- Antigravity CLI Hook 说明：`templates/antigravity-knowledge-feedback-hook.md`
- Harness 校验：`scripts/agent-harness-verify.mjs`

## 项目层入口

- 项目章程：`project/charter.md`
- 项目任务路由覆盖：`project/task-routing-overrides.md`
- 项目验证矩阵：`core/validation/test-matrix.md`

## 适用边界

本模板只定义 Agent 如何工作，不定义具体业务。业务结构、地图、弹窗、状态、资源目录等内容必须写在项目覆盖层。
