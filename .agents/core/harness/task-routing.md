# 任务路由

本文档用于把用户自然语言需求转换为最小阅读路径。不要让用户帮 Agent 指定该读哪些文件；Agent 应先自行判断任务意图，再读取对应文档和最近实现面。

## 默认流程

1. 优先运行 `scripts/agent-context-pack.mjs`，生成任务大小、预算和建议阅读路径。
2. 判断主任务类型。
3. 如有多个意图，选择一个主类型和一个辅助类型。
4. 读取对应的通用任务文档。
5. 读取 `.agents/project/charter.md`。
6. 读取相关项目架构、领域或模块文档。
7. 命中第三方库、API、SDK、版本、官方规则或外部工具接入时，读取 `core/harness/tool-capability-matrix.md` 并执行实时文档闸口。
8. 如果仍存在产品或边界歧义，只问 1 到 2 个必要问题。

## 任务类型

### 新增页面绘制

适用于新增页面、新模块、新视觉区块、切图还原或大屏布局实现。

读取：

- `.agents/core/harness/tasks/page-build.md`
- `.agents/project/architecture/layout-and-routing.md`
- `.agents/project/architecture/assets-and-resources.md`
- 相关领域或模块文档

常见锚点：

- 相邻页面或模块
- `src/router/index.js`
- 对应资源目录

### 新增交互

适用于按钮、弹窗、状态切换、轮播、详情展开、跨面板联动或地图触发。

读取：

- `.agents/core/harness/tasks/interaction-change.md`
- `.agents/project/architecture/state-boundaries.md`
- 项目覆盖层中声明的相关领域或模块文档

常见锚点：

- 交互所属组件
- 最近的 watcher、事件处理函数或 computed
- 涉及跨视图协调时的 Pinia action 或 state

### 需求修改

适用于修改已有规则、布局、文案、数据展示、业务限制或行为。

读取：

- `.agents/core/harness/tasks/requirement-change.md`
- 相关项目领域文档
- 已知模块的项目 playbook

常见锚点：

- 当前实现位置
- 父组件或调用方
- 相关 store、router、effect 或数据适配器

### Bug 修复

适用于行为损坏、残留状态、布局错位、watcher 问题、运行时错误或渲染不符合预期。

读取：

- `.agents/core/harness/tasks/bug-fix.md`
- 出错功能的最近实现面
- 本地控制路径不清楚时再读项目领域文档

常见锚点：

- 报错组件或 effect
- 直接控制失败行为的函数
- 相邻 watcher、computed、事件链路

### 测试回归

适用于验证近期改动是否破坏已有行为。

读取：

- `.agents/core/harness/tasks/regression.md`
- 与改动区域匹配的任务文档
- 相关项目领域或模块文档

常见锚点：

- 已改模块
- 受影响路由
- 与改动相连的 watcher、effect 或共享状态

### 资源/数据更新

适用于图片、SVG、视频、静态 JSON、CSV、txt、PDF 引用或数据转换脚本。

读取：

- `.agents/core/harness/tasks/asset-data-update.md`
- `.agents/project/architecture/assets-and-resources.md`
- 涉及数据契约时读取 `.agents/project/domains/static-data.md`

常见锚点：

- `src/assets/images/`
- `src/assets/svg/`
- `src/assets/js/`
- `scripts/`

## 实时文档闸口

当任务涉及第三方库、框架、SDK、CLI、MCP、插件、云服务 API、版本升级、breaking change、官方限制或工具接入时，Agent 必须验证实时或官方文档。

默认读取：

- `core/harness/tool-capability-matrix.md`
- 当前项目 `project/project-profile.md` 和相关依赖、API、schema、配置文件
- 官方文档、`openai-docs`、Context7、agent-reach 或 Firecrawl 等实时来源

输出或 evidence 必须写清：

- 查了哪个库、API、版本或 URL。
- 使用了哪个来源。
- 哪条事实影响了本次实现或判断。
- 无法联网或无法验证时的 fallback 和风险。

OpenAI / Codex / ChatGPT 相关任务优先使用 `openai-docs` 或官方 OpenAI 文档；其它库优先官方文档，其次 Context7 或可信实时抓取。

## 项目覆盖层

具体项目可在 `.agents/project/task-routing-overrides.md` 定义补充阅读路径。任务命中项目专属模块、领域或业务对象时，读取该覆盖文件后再决定具体架构、领域或模块文档。

## 契约与评估

跨文件、跨模块、跨状态、运行时交互、公开接口或长任务，先按 `core/harness/task-intake.md` 判定等级；`complex` 和 `long` 任务读取 `core/harness/task-contract.md` 并创建任务契约。完成实现后，按 `core/harness/evaluator.md` 做独立评估。

## 多意图处理

- “新增一个首页模块并加弹窗交互”：主类型为新增页面绘制，辅助类型为新增交互。
- “修复地图联动后验证首页没有回归”：主类型为 Bug 修复，辅助类型为测试回归。
- “换数据并调整表格展示”：主类型为资源/数据更新，辅助类型为需求修改。

## 停止条件

如果任务归属、功能 owner、源素材或业务解释无法确认，停止实施并向用户说明缺口。
