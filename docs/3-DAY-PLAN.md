# 三天+扩展计划：从最小 Agent 到可持久化应用

> 前置：已完成 2 天计划（P0–P8）、Day 3 工具调用、Day 4 MySQL 持久化（D4-1~D4-5，均已提交）。
> 当前应用：会话/消息存 MySQL、前端以 MySQL 为准、Checkpointer 用 PyMySQLSaver。
> 本计划是**可选进阶**，作业本身已达标。

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

## Day 5+（完整路线，按性价比排序）

### 梯队 A｜近期（先把项目打磨圆）

#### A1｜SSE 流式输出（1–1.5 h，推荐先做）

- 后端：`graph.stream()` + FastAPI `StreamingResponse`，逐句返回；
- 前端：`fetch` + `ReadableStream`（或 `EventSource`），边收边渲染；
- 通过条件：AI 回答在页面里“一个字一个字蹦出来”，而不是整段一次出现。

#### A2｜工程化收尾（1–1.5 h）

- **删除会话时清理 checkpoints**：现在 `DELETE /conversations/{id}` 只删 `sessions`，
  `checkpoints/checkpoint_writes` 会留孤儿数据，要一并清；
- 统一错误处理 + `logging`；
- 加第 2、3 个工具（算数 / 查天气），练多工具下模型选择（呼应 D3 实验）。
- 通过条件：删一个会话后，MySQL 里它的 sessions 和 checkpoints 记录都不在。

### 梯队 B｜中期（新概念）

#### B1｜RAG 个人知识库（2–3 h，最有成就感）

- 让模型“读你自己的文档”再回答：文档切片 → 向量化 → 检索相关片段 → 塞进上下文；
- 学：embedding、向量检索、上下文注入；依赖已有的 memory / `get_state` 底座。
- 通过条件：上传一篇文档后，问“文档里说了什么”能引用原文回答。

#### B2｜Human-in-the-loop（1.5–2 h）

- `interrupt()` 让 Agent 干到一半停下来等你确认（如“确定要执行这个工具吗？”）；
- 学：LangGraph 中断与恢复（基于已有 `graph.get_state`，接着学 `Command(resume=...)`）。
- 通过条件：工具调用前会弹出确认，确认后才执行。

#### B3｜LangGraph 进阶（1.5–2 h）

- 子图（Subgraph）、并行节点（多工具同时跑）、自定义 State 字段。

### 梯队 C｜长线（让项目“活”起来）

#### C1｜Docker 部署上线（1.5–2 h）

- Docker Compose 一键打包 `后端 + 前端 + MySQL`；
- 内网穿透 / 局域网，手机也能访问。
- 通过条件：`docker compose up` 一条命令全起来，浏览器可访问。

#### C2｜认证与多用户（1.5–2 h）

- 登录 + 每个用户独立会话（`user_id` 前缀进 `thread_id` 实现隔离）。

## 学习边界

- 流式与 RAG 优先做；认证/部署按需；
- 数据库仍由 LangGraph Checkpointer 托管，不手动改 blob；
- 每个块保持“写一点、跑一次、说清楚”。

## 官方资料

- [LangGraph 持久化 Checkpointer](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph 内存/持久化概念](https://docs.langchain.com/oss/python/langgraph/memory)
- [SQLAlchemy 快速上手](https://docs.sqlalchemy.org/en/20/orm/quickstart.html)
- [mysql-connector-python](https://dev.mysql.com/doc/connector-python/en/)
