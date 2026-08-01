# 两天学习计划：从聊天接口到最小 Agent

## 最终验收

两天结束时，不以“看完多少文档”为标准，而以这 6 个可演示结果为准：

- 能从浏览器发消息并看到真实 DeepSeek 回复；
- 能创建两个会话，历史互不混合；
- 能在同一会话追问上一轮信息；
- 能在 FastAPI `/docs` 解释请求与响应字段；
- 能画出 `Browser -> FastAPI -> LangGraph -> DeepSeek` 请求链；
- 能不用看答案解释 State、Node、Edge、Checkpointer、thread_id 各自负责什么。

预计每天 6 小时，单个学习块控制在 25～60 分钟。每块都必须“写一点、跑一次、说清楚”，不要连续看两小时视频。

## Day 1：Python + FastAPI + DeepSeek（约 6 小时）

### 09:00–09:30｜先玩前端，建立目标画面

执行 README 的 3 分钟验收。打开右侧“请求上下文”，观察当前窗口历史如何变长。

通过条件：你能说清 `conversation_id` 负责隔离窗口，`history` 负责携带上下文。

### 09:30–10:20｜只补项目需要的 Python

完成练习册 P0：变量、`list`、`dict`、函数、类型标注、`class`、`async def`、环境变量。

通过条件：能把一个消息字典列表遍历打印，并解释 `list[ChatMessage]`。

### 10:30–11:20｜FastAPI 最小服务

创建虚拟环境、安装依赖，亲手完成 `GET /health`。

通过条件：浏览器和 `curl` 都得到 `200`，`/docs` 能打开。

### 11:30–12:20｜Pydantic 接口模型

按 [接口契约](API-CONTRACT.md) 手写 `ChatMessage`、`ChatRequest`、`ChatResponse`。

通过条件：合法 JSON 得到预期结构；错误 role 或空字段得到 `422`。

### 13:30–14:30｜第一次真实调用 DeepSeek

先在一个独立函数里传入固定消息列表，读取环境变量并打印最终回答。API Key 只存在 `.env`。

通过条件：终端得到真实模型回答；仓库搜索不到真实 Key。

### 14:40–15:40｜把模型接进 `/api/chat`

完成 `client_history`：后端拼接 `history + 当前消息` 后请求 DeepSeek。

通过条件：Swagger 中连续两次请求，第二次能回答第一轮的信息。

### 15:50–16:30｜浏览器联调与 CORS

前端切换“FastAPI 联调”，测试连接后发送消息。只允许两个明确的本地 Origin。

通过条件：Network 中 `POST /api/chat` 为 `200`，页面显示真实回复。

### 16:30–17:00｜日终复盘

不看代码画请求链，并回答：为什么 DeepSeek API 不会自动记住上一轮？如果把 A 窗口历史发到 B 窗口，会发生什么？

当天最重要产出：**一个自己写的、能多轮聊天的 FastAPI 接口。**

## Day 2：LangGraph 状态与记忆（约 6 小时）

### 09:00–09:40｜理解图，不急着接模型

在纸上画 `START -> call_model -> END`，为每个概念写一句人话：

- State：这次执行过程中共享的数据；
- Node：接收 State 并返回局部更新的 Python 函数；
- Edge：决定下一步去哪里；
- Checkpointer：按 thread 保存每轮后的 State；
- thread_id：哪一段对话的唯一钥匙。

通过条件：不用术语复读，也能给前端同事讲明白。

### 09:50–10:50｜完成第一个单节点 StateGraph

先用固定回复节点，不接 DeepSeek。输入一条 user message，图返回一条 assistant message。

通过条件：终端打印图执行后的完整 messages。

### 11:00–12:00｜把 DeepSeek 变成模型节点

安装并使用 `langchain-deepseek`，让 Node 调用模型。模型名从环境变量读取。

通过条件：`graph.invoke(...)` 得到真实回复；节点只负责“读 State → 调模型 → 返回更新”。

### 13:30–14:30｜加入 `InMemorySaver`

编译 graph 时加入 Checkpointer；调用时把 `conversation_id` 放入 `configurable.thread_id`。

通过条件：同一 thread 第二轮能回答上一轮；不同 thread 无法读取彼此内容。

### 14:40–15:30｜把 FastAPI 切到 `graph_memory`

保留同一接口契约，但后端只把当前消息传给 graph，绝不重复追加浏览器传来的 history。

通过条件：右侧切换为 `graph_memory` 后，同一窗口多轮成功、两个窗口隔离。

### 15:40–16:30｜完成作业验收脚本

按固定口令测试：

1. A 窗口：“记住项目代号是海星 27。”
2. A 窗口：“项目代号是什么？”
3. B 窗口：“项目代号是什么？”
4. 切回 A 再问一次。

通过条件：A 能答，B 不应知道，切回 A 仍能答。

### 16:30–17:00｜复盘与下一步

把 Day 1 和 Day 2 的差别写成 5 句话。然后只选一个第三天扩展：

1. 加一个天气工具节点；
2. 把 `InMemorySaver` 换成持久化 Checkpointer；
3. 加 SSE 流式输出。

不要同时开三个分支。

## 卡住时的 15 分钟规则

1. 先读完整错误最后 10 行；
2. 判断错误属于环境、类型、HTTP、模型还是图状态；
3. 用最小输入直接测出错层，不要每次都从浏览器开始；
4. 15 分钟仍无进展，再把“执行命令 + 完整错误 + 预期结果”交给 Agent 分析；
5. Agent 可以解释和给提示，但你要自己敲后端关键代码。

