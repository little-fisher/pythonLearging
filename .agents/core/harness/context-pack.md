# 上下文包

上下文包用于把任务入口、推荐阅读文档、项目覆盖规则、预算和必要摘录收敛到一个短文档，避免每次任务靠人工反复指路。

## 生成方式

```bash
node .agents/scripts/agent-context-pack.mjs --task "用户原始需求"
```

常用参数：

- `--agents-dir <path>`：指定 Agent 工程目录。
- `--write`：写入上下文包，项目模式默认写到 `.agents/project/memory/current/context-pack.md`。
- `--json`：输出结构化 JSON，方便其他工具接入。
- `--no-content`：只输出文档路径和预算，不附文档摘录。

## 包含内容

- 用户原始任务。
- 任务类型和任务大小。
- token 预算、最大文档数和执行闸口。
- 自动选择的阅读文档。
- 项目覆盖规则命中的原因。
- 缺失文档或工具限制。
- 必要文档摘录。
- 收尾时是否需要经验抽取、契约压缩或交接。

## 自动选文档规则

上下文包按以下顺序组装：

1. 固定入口：`AGENTS.md`、`core/harness/task-intake.md`、`core/harness/task-routing.md`。
2. 任务类型文档：例如 bug、交互、资源/数据、回归。
3. 项目基础文档：`project/charter.md`、`project/task-routing-overrides.md`。
4. 项目覆盖配置：`project/context-pack.config.json` 中命中的规则。
5. 分级闸口文档：复杂任务补充契约、记忆、Evaluator 和预算文档；长任务补充编排文档。

## 使用边界

- 上下文包是入口建议，不替代源码阅读和验证。
- 缺失的文档要在包里标记，不要凭空假设内容。
- 包内摘录只保留当前任务需要的片段，避免把全部规则搬入上下文。
- 同一项目日常任务只读项目 `.agents`，不要再重复读取知识库里的通用模板。

