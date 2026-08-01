# 工具能力矩阵

本文档用于把外部 Codex / MCP / skill 推荐放回 Harness 分层里判断。目标不是堆工具, 而是回答:

```text
这个工具属于哪一层, 替代谁, 补哪个缺口, 需要什么证据?
```

## 能力分层

| 能力层 | Harness 默认资产 | 可选外部工具 | 判断口径 |
|---|---|---|---|
| 代码库记忆 | CodeGraph, `project-code-graph.md`, `business-knowledge.md` | Codebase Memory MCP | 先确认是否能稳定生成本地索引、业务概念索引和影响面证据。 |
| 运行时验收 | Playwright recipes, QA Gate, evidence | Playwright skill / MCP | 工具只负责采集页面、console、network 和截图事实, Harness 负责记录证据和 pass 闸口。 |
| 任务拆解 | task-intake, task-contract, harness-run, agentctl | Taskmaster AI | 如果只是拆步骤, 用 Harness 契约; 如果需要依赖图和进度看板, 再评估外部工具。 |
| 联网调研 | agent-reach, web search, Jina Reader | Firecrawl | 需要批量抓取、JS 页面、结构化 Markdown 或网页交互时再引入。 |
| 实时文档 | openai-docs, official docs, agent-reach | Context7 | 涉及第三方库、SDK、API、版本差异时必须查实时或官方文档。 |
| 知识回流 | knowledge-feedback, Knowledge Impact, LLM Wiki Compiler | 专用 memory skill | Raw 自动编译进机器 Wiki；不自动修改个人画像或可执行 Schema。 |

## 选择规则

1. 先复用 Harness 已有层, 不因为工具名字新就接入。
2. 外部工具必须补一个明确缺口: 更快索引、更准文档、更强网页抓取、更清晰依赖图或更好验收证据。
3. 工具输出不能直接作为任务成功结论, 必须进入 evidence、graph、context-pack 或 feedback-candidates。
4. 能力属于扩展层时, 不写进 Harness Core 状态机; Core 只关心范围、证据、评估和关闭。
5. 任何会修改全局提示词、人工维护规则、个人画像或可执行资产的工具接入, 必须先人工确认；机器 Wiki 的自动重编译不属于此类修改。

## 实时文档闸口

命中以下任一条件时, Agent 必须验证实时或官方文档:

- 第三方库、框架、SDK、CLI、MCP、插件或云服务 API。
- 版本敏感任务, 例如升级、迁移、breaking change、配置项变化。
- 官方规则、计费、限制、接口字段、鉴权、部署或安全策略。
- OpenAI / Codex / ChatGPT 相关问题, 优先走 `openai-docs` 或官方 OpenAI 文档。

证据至少写清:

- 查询来源: official docs / Context7 / openai-docs / agent-reach / Firecrawl。
- 文档对象: 库名、API、版本或 URL。
- 采用结论: 本次实现或判断用了哪条文档事实。
- 无法验证时的原因和 fallback。

## Codebase Memory 对齐口径

Codebase Memory 类工具的价值不是“记住聊天”, 而是让 Agent 以低 token 成本查询代码结构。Harness 对齐时只看四件事:

1. 是否有本地代码索引。
2. 是否能查询符号、调用链、路由、接口和影响面。
3. 是否把代码事实转成 Agent 启动可读的 `project-code-graph.md` 和 `business-knowledge.md`。
4. 是否在任务结束后回补 changed / impacted 信息。

如果前两项由 CodeGraph 或 Codebase Memory 提供, 后两项仍由 Harness 负责沉淀和验收。

## 不做的事

- 不把工具清单写成安装清单。
- 不让外部工具替代 `run.json`、evidence、Evaluator 或 QA Gate。
- 不把工具宣传指标直接当成 Harness 价值指标。
- 不在没有项目缺口时强制引入 Firecrawl、Context7、Taskmaster 或 Codebase Memory。
