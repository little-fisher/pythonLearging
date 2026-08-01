# Project Code Graph

- generated_at: 2026-08-01T05:01:07.434Z
- engine: codegraph+static-business-layer
- codegraph_command_available: true
- codegraph_index_present: true
- files: 1
- import_edges: 0
- modules: 1
- changed_files: 0

## How Agents Should Use This

- 定位功能时先看 Business Knowledge，再看模块和高耦合文件。
- 修改前查看 changed/focus 影响面和 fan-in/fan-out。
- CodeGraph MCP 可用时，优先用 codegraph_explore/search/impact 做符号级查询；本图谱沉淀业务概念和任务交接摘要。

## Focus

- no changed files detected

## Top Coupled Files

- frontend/app.js: fan_in=0, fan_out=0, score=0

## Modules

### frontend
- files: 1
- fan_in: 0
- fan_out: 0
- concepts: frontend, js, bind, events, load, workspace, sanitize, session

## Recommendations

- 暂无明显结构风险；仍需按任务类型做窄验证。

