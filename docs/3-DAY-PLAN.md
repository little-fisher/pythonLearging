# 三天+扩展计划：从最小 Agent 到可持久化应用

> 前置：已完成 2 天计划（P0–P8）与 Day 3 工具调用（`backend/app/graph.py` 已含
> `@tool` + `bind_tools` + `call_tool` 节点 + 条件边）。本计划是**可选进阶**，作业本身已达标。

## 最终验收

- 会话列表存进 MySQL，**刷新/重启后端后依然存在**；
- 前端能从后端拉取会话列表（不再只靠 localStorage）；
- 后端 Checkpointer 换成持久化实现，`thread_id` 对应数据库里的会话；
- 能画出 `Browser -> FastAPI -> MySQL` 与 `Browser -> FastAPI -> LangGraph(持久化 Checkpointer) -> DeepSeek` 两条数据链；
- （加分）能回答：为什么 `InMemorySaver` 不能当生产数据库，换成什么、要建哪些表。

预计每次 1.5～2 小时，共 2～3 次学完；单个学习块 30～60 分钟，每块"写一点、跑一次、说清楚"。

## Day 4：MySQL 会话入库（约 2.5～3.5 小时）

### D4-1｜建表与连接（30–45 min）

- 在 `backend/requirements.txt` 加 MySQL 驱动（`mysql-connector-python` 或 `SQLAlchemy`）；
- 本地 MySQL 建库（如 `agent_lab`），写 `sessions` 表：`id` / `title` / `created_at` / `updated_at`；
- 用 Navicat 确认表建好。

通过条件：`python -c` 能连上库并 `SELECT 1`；`requirements.txt` 与 `.env`（DB 连接串）有改动且 `.env` 不入库。

### D4-2｜后端 CRUD 接口（45–60 min）

- 新增 `GET /conversations`：返回会话列表（id/title/时间）；
- 新增 `DELETE /conversations/{id}`；
- `/api/chat` 首次新会话时把会话写库。

通过条件：`curl` 能列出、删除会话；重复请求不产生重复会话。

### D4-3｜前端从后端拉会话（45–60 min）

- 打开页面时 `fetch` 会话列表渲染到左侧；
- 新建/删除会话时同步调用后端；
- 保留 localStorage 作为离线兜底（可选）。

通过条件：刷新页面会话仍在，且来自后端数据；删一个会话页面同步消失。

### D4-4｜Checkpointer 换成持久化（30–45 min）

- 用 `langgraph-checkpoint-mysql`（或 `PostgresSaver`）替换 `InMemorySaver`；
- 建 LangGraph 要求的 checkpoint 表；
- `thread_id` 继续沿用 `conversation_id`。

通过条件：**重启后端后**，同 `conversation_id` 追问上一轮信息仍能接上（这是 D4-4 的硬验收，也是口试第 4 题的实战版）。

## Day 5+（可选加分项）

| 卡片 | 内容 | 预估 |
|---|---|---|
| S1 | SSE 流式输出：前端一个字一个字蹦出来 | 1–1.5 h |
| S2 | 统一错误处理 + 请求日志 | 1 h |
| S3 | 部署思路：`.env` 生产配置、Docker | 1–1.5 h |

## 学习边界

- D4 只做"会话列表 + 状态持久化"，不做登录/权限；
- 数据库只存必要的会话元数据，完整对话消息仍由 Checkpointer 管理；
- 若 MySQL 装不上，可用 SQLite 的持久化 Checkpointer 先跑通同样思路。

## 官方资料

- [LangGraph 持久化 Checkpointer](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph 内存/持久化概念](https://docs.langchain.com/oss/python/langgraph/memory)
- [SQLAlchemy 快速上手](https://docs.sqlalchemy.org/en/20/orm/quickstart.html)
- [mysql-connector-python](https://dev.mysql.com/doc/connector-python/en/)
