# Agent Lab：第一个可运行 Demo

这个工作区用小型、可验证的纵向项目学习 Python Agent 开发。第一个目标是完成一个 DeepSeek 可视化聊天助手，并把三件事串起来：

1. 页面能发送和展示消息；
2. 多个会话窗口互相隔离；
3. 同一会话能带上历史，完成真正的多轮对话。

当前已经生成前端、接口契约、学习练习册和 **Python 后端（FastAPI + LangGraph）**。后端由你按练习卡亲手创建，并逐卡验收通过。

## 完成情况（2026-08-02）

三项作业目标全部完成，并做了超额扩展：

| 作业要求 | 实现位置 | 状态 |
|---|---|---|
| 01 做页面：输入框 / 发送 / 消息区 / 调 DeepSeek | `frontend/*` + `backend/app/main.py` | ✅ |
| 02 切窗口：每个会话独立消息历史 | `app.js` 会话列表 + localStorage | ✅ |
| 03 做多轮：带当前窗口历史继续发给 DeepSeek | `client_history`（P4）/ `graph_memory`（P8） | ✅ |

额外扩展：
- 契约化 API：Pydantic 校验 + 错误码（400/422/502）+ CORS 白名单（P1–P5）
- LangGraph 记忆：`MessagesState` + `InMemorySaver` Checkpointer + `thread_id` 隔离（P6–P8）
- 工具调用 Agent：`@tool` + `bind_tools` + `call_tool` 节点 + 条件边 + 回环（Day 3）

启动方式（后端必须从 `backend/` 目录启动，`load_dotenv()` 按当前工作目录找 `.env`）：

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000   # 后端
python3 -m http.server 5173 -d frontend                       # 前端
```

## 先运行前端

```bash
cd /Users/luhonggang/Project/AI/learning
python3 -m http.server 5173 --directory frontend
```

浏览器访问 `http://localhost:5173`。页面默认是“本地演示”模式，不需要 API Key，也不依赖后端。

建议先做这组 3 分钟验收：

1. 发送“记住：我叫小林，我在学习 Python”；
2. 继续追问“我刚才说了什么？”；
3. 新建另一个会话并问“我叫什么？”，确认它看不到第一个会话的内容；
4. 切回第一个会话，确认历史仍在；
5. 刷新页面，确认会话没有消失。

## 两天怎么走

- [两天学习计划](docs/2-DAY-PLAN.md)：按时间块安排学习和验收。
- [三天+扩展计划](docs/3-DAY-PLAN.md)：可选进阶 —— MySQL 会话入库、持久化 Checkpointer、流式输出。
- [Python 后端练习册](backend/WORKBOOK.md)：只给任务、接口、提示和通过条件，不给完整答案。
- [前后端接口契约](docs/API-CONTRACT.md)：你写 Pydantic 模型和路由时的唯一字段依据。

## 目录说明

```text
learning/
├── frontend/              # 已生成，可直接运行
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/               # 由你亲手补 Python
│   ├── .env.example
│   ├── requirements.txt
│   └── WORKBOOK.md
├── docs/
│   ├── 2-DAY-PLAN.md
│   └── API-CONTRACT.md
└── .agents/               # 长期学习工作区的 Agent 规则与任务记录
```

## 推荐方案与取舍

| 方案 | 做法 | 放弃成本 |
|---|---|---|
| A. 只写 FastAPI | 两天都手工拼接历史 | 最快，但看不到 LangGraph 的状态和图结构 |
| **B. 先 FastAPI，再 LangGraph** | 第一天跑通直连，第二天替换为图和 Checkpointer | 会写两次模型调用适配，但最容易真正理解，当前采用 |
| C. 直接上 LangGraph | 从第一行就用 StateGraph | 文件更少，但 Python、HTTP、模型与图的问题混在一起，不适合两天入门 |

## 学习边界

这两天不做流式输出、数据库、登录、RAG、工具调用和部署。完成当前三项目标后，再按“工具节点 → 持久化 → RAG”的顺序扩展。

## 官方资料

- [FastAPI Request Body](https://fastapi.tiangolo.com/tutorial/body/)
- [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/)
- [DeepSeek 多轮对话](https://api-docs.deepseek.com/zh-cn/guides/multi_round_chat)
- [DeepSeek Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion)
- [LangGraph Overview](https://docs.langchain.com/oss/python/langgraph/overview)
- [LangGraph Memory](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [LangChain DeepSeek 集成](https://docs.langchain.com/oss/python/integrations/chat/deepseek)

