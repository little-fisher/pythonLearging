# Knowledge Feedback Raw Ledger

> Append-only Agent task and outcome sources. The machine Wiki is compiled automatically; no per-entry promotion review is required.


<!-- knowledge-feedback-id: 34b488e293b9 -->
## 2026-08-01 - 创建首个 Agent 聊天 Demo 与两天 FastAPI LangGraph 学习路线

### Knowledge Feedback

- task_type: requirement-change
- agent_tool: unknown
- duration_minutes: unknown
- duration_source: unknown
- knowledge_used: yes
- useful_sources: 个人知识管理/01-个人画像.md;个人知识管理/02-工作流索引.md;个人知识管理/wiki/index.md;个人知识管理/11-知识写入与检索路由.md
- missing_sources: 缺少 Python Agent 两天入门的专项纵向练习模板
- decisions: 采用每30分钟一个可验证纵向闭环；前端可生成但Python核心由学习者手写；Day1显式历史Day2切LangGraph thread记忆
- validation: JS语法、Harness、自适应页面与Playwright多轮多窗口持久化验证通过，console 0 error；真实后端留给用户手写
- reusable_asset: 两天学习计划、Python手写练习册、聊天API契约、可视化上下文观察前端
- suggested_destination: 项目 .agents 与机器 Wiki
- confidence: high
- sensitive: no

### Knowledge Impact

- task: 创建首个 Agent 聊天 Demo 与两天 FastAPI LangGraph 学习路线
- workflow: 项目内教学
- knowledge_level: K2
- useful_sources: 个人知识管理/01-个人画像.md;个人知识管理/02-工作流索引.md;个人知识管理/wiki/index.md;个人知识管理/11-知识写入与检索路由.md
- missing_sources: 缺少 Python Agent 两天入门的专项纵向练习模板
- saved_explanation: unknown
- avoided_rework: unknown
- better_decision: unknown
- reusable_output: unknown
- next_update: none

<!-- knowledge-feedback-id: 7174f6ddeefa -->
## 2026-08-23 - LangGraph L8 流式输出学习（节点级/token级/SSE端点）

### Knowledge Feedback

- task_type: learning
- agent_tool: unknown
- duration_minutes: unknown
- duration_source: unknown
- knowledge_used: yes
- useful_sources: langgraph-lab/PLAN.md, langgraph-lab/l5_chat.py, langgraph-lab/l7_tool.py
- missing_sources: 无
- decisions: stream返回生成器不可下标；节点级流式粒度=节点看不到打字机；token级需模型streaming=True+stream_mode=messages双改；metadata.langgraph_node是token出生证明可过滤多节点输出；SSE格式data:内容+双换行，StreamingResponse配media_type=text/event-stream；[DONE]结束标记必须在for循环外yield
- validation: 终端逐字输出验证通过；浏览器访问/chat/stream逐段蹦出+[DONE]结尾验证通过
- reusable_asset: l8_stream.py/l8_sse.py 学习样例
- suggested_destination: langgraph-lab
- confidence: high
- sensitive: yes

### Knowledge Impact

- task: LangGraph L8 流式输出学习（节点级/token级/SSE端点）
- workflow: 逐关手写练习 + 问答验收
- knowledge_level: K3
- useful_sources: langgraph-lab/PLAN.md, langgraph-lab/l5_chat.py, langgraph-lab/l7_tool.py
- missing_sources: 无
- saved_explanation: unknown
- avoided_rework: unknown
- better_decision: unknown
- reusable_output: unknown
- next_update: none
