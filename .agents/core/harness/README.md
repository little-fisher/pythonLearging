# Harness Core

Harness Core 是约束并验证 Agent 单次任务执行的规范层。

请先读：

- [[AI工程/Harness工程模板/core/harness/HARNESS_CORE_SPEC]]

## 当前定位

Harness Core 正在从更宽泛的 Agent 工程化工具箱中拆出来。

Core 负责：

- 任务入口和分级。
- 上下文选择。
- 范围和成功标准。
- 证据。
- 评估。
- 关闭规则。
- `harness-run.mjs` 最小运行时。
- 工具能力分层和实时文档闸口的入口规则。

Core 不负责：

- 知识回流。
- 记忆抽取。
- 自进化提案。
- 多 Agent 编排。
- 工具专属 hook 或 adapter。

这些能力仍然有用，但它们是 closed Harness run 之上的扩展或编排层。

## 工具能力入口

外部 Codex skills、MCP 或联网工具评估先读 `tool-capability-matrix.md`。它用于判断工具属于代码库记忆、运行时验收、任务拆解、联网调研、实时文档还是知识回流层，并要求工具输出进入 evidence、graph、context-pack 或 feedback-candidates。

## 修改规则

修改 Harness Core 前，必须阅读 `HARNESS_CORE_SPEC.md`。

任何会削弱 `run.json` 唯一机器状态源、绕过 evidence、或允许 failed run 关闭的变更，都必须视为规格变更，并需要用户明确确认。
