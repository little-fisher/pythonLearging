# 项目初始化识别

项目初始化识别用于把一个新项目或已开发大半的项目，接入 Harness 后快速形成项目画像。

它解决的问题不是“替项目写规范”，而是先识别项目已有事实：

- 技术栈和包管理器。
- 代码规范、格式化、lint、测试命令。
- 设计规范、Figma/截图/视觉参考。
- 需求文档、PRD、验收标准和业务术语。
- API 契约、TS 类型、OpenAPI、Swagger、DTO、schema。
- 已有 `.agents/project/` 记忆、候选和运行态。
- 代码模块、路由、接口、业务概念、imports 关系和高耦合点。

## 原则

- 只识别，不改业务代码。
- 只补缺失项目画像和上下文配置，不覆盖人工写过的项目规则。
- `micro / normal` 任务不自动触发项目级初始化；全局 bridge 可独立完成轻量知识回流。
- 新接入项目 SHOULD 先跑一次初始化识别。
- 一次性目录和临时 workspace 不铺设完整 Harness。
- 初始化只负责首次接入，不负责把模板新版本覆盖到已有项目。
- 已开发大半的项目 MUST 优先识别现有规范，而不是复制一份空规则。

## 推荐产物

```text
.agents/project/
  project-profile.md              # 自动识别出的项目画像
  graph/
    project-code-graph.json        # 机器可读代码知识图谱
    project-code-graph.md          # 人类可读模块/耦合/影响面摘要
    business-knowledge.md          # 业务概念到代码位置的索引
  context-pack.config.json         # 上下文包自动选文档规则
  charter.md                       # 人工补充项目定位和边界
  task-routing-overrides.md        # 人工补充项目路由覆盖
  memory/current/
  memory/monthly/
```

## 初始化流程

```bash
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent
node .agents/scripts/agent-harness-verify.mjs --agents-dir .agents
node .agents/scripts/agent-context-pack.mjs --task "验证项目初始化画像" --write
```

初始化脚本会：

1. 复制缺失的 `.agents/core/`、`scripts/`、`hooks/`、`templates/` 和入口文件。
2. 补齐 `.agents/index.md`、项目章程、任务路由覆盖和 `.agents/project/memory/`。
3. 默认尝试安装 CodeGraph CLI。
4. 默认执行 `codegraph install`，把 CodeGraph MCP 接入 Claude Code、Codex CLI、OpenCode 等已识别 Agent。
5. 默认执行项目级 `codegraph init`，创建 `.codegraph/` 并建立本地索引。
6. 扫描 package、tsconfig、lint、format、test、build、Playwright 等工程入口。
7. 扫描 docs、requirements、design、figma、api、schema 等候选文档。
8. 生成 `.agents/project/project-profile.md`。
9. 生成 `.agents/project/graph/` 下的项目代码知识图谱和业务概念索引。
10. 在不存在 `context-pack.config.json` 时生成一份轻量上下文规则。
11. 保留人工已有文件，不覆盖稳定项目规则。

## CodeGraph 完整接入

全局初始化器默认会执行完整接入。受限环境可关闭其中一部分：

```bash
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent --no-codegraph-install
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent --no-codegraph-agent-install
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent --no-codegraph
```

如果不全局安装，但允许通过 npx 使用 CodeGraph：

```bash
/Users/luhonggang/.agents/bin/agent-project-init --project-root "$PWD" --silent --codegraph-use-npx
```

手动修复完整接入时使用三步：

```bash
npm i -g @colbymchenry/codegraph
codegraph install
node .agents/scripts/agent-codegraph.mjs init --project-root "$PWD" --write
```

只重建项目画像和业务图谱：

```bash
node .agents/scripts/agent-project-profile.mjs --project-root "$PWD" --write
```

初始化后应存在：

- 项目根 `.codegraph/`
- `.agents/project/graph/codegraph-status.md`
- `.agents/project/graph/codegraph-snapshot.md`
- `.agents/project/graph/project-code-graph.md`
- `.agents/project/graph/business-knowledge.md`

## 人工补充点

自动识别后，至少由人或 Agent 补齐：

- 项目真实启动命令和验证命令。
- 设计稿来源和验收口径。
- 核心业务模块、路由、接口 owner。
- 哪些目录禁止 Agent 自动修改。
- 客户敏感信息和脱敏规则。

## 与任务分级的关系

| 任务大小 | 初始化要求 |
|---|---|
| `micro` | 不触发初始化。 |
| `normal` | 不自动初始化；如果长期项目缺少 `project-profile.md`，可提醒后续显式接入。 |
| `complex` | 如果缺少项目画像或上下文规则，SHOULD 先跑初始化识别。 |
| `long` | MUST 先建立项目画像、阶段记忆和验证入口。 |
