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

<!-- knowledge-feedback-id: f28c7a2410b6 -->
## 2026-08-23 - LangGraph L9 Human-in-the-loop 学习（interrupt/Command 审批流）

### Knowledge Feedback

- task_type: learning
- agent_tool: unknown
- duration_minutes: unknown
- duration_source: unknown
- knowledge_used: yes
- useful_sources: langgraph-lab/PLAN.md, langgraph-lab/l9_hitl.py
- missing_sources: 无
- decisions: interrupt必须配checkpointer（冻结=存档退出而非挂起）；Command(resume=X)让interrupt()调用返回X，进哪个字段由赋值和return决定；resume时节点从头重跑故模型调用必须放interrupt之前的节点（无副作用节点）；打回意见经decision字段拼进generate的prompt实现越改越好；thread_id是存档编号resume必须一致
- validation: 三次invoke完整跑通：出方案→打回带意见→新方案体现意见→通过→END
- reusable_asset: l9_hitl.py 审批流样例
- suggested_destination: langgraph-lab
- confidence: high
- sensitive: no

### Knowledge Impact

- task: LangGraph L9 Human-in-the-loop 学习（interrupt/Command 审批流）
- workflow: 逐关手写练习 + 问答验收
- knowledge_level: K3
- useful_sources: langgraph-lab/PLAN.md, langgraph-lab/l9_hitl.py
- missing_sources: 无
- saved_explanation: unknown
- avoided_rework: unknown
- better_decision: unknown
- reusable_output: unknown
- next_update: none

<!-- knowledge-feedback-id: 8b3cf7220fbc -->
## 2026-08-26 - git push 推送大文件到 GitHub 连接被重置

### Knowledge Feedback

- task_type: ops-troubleshooting
- agent_tool: unknown
- duration_minutes: unknown
- duration_source: unknown
- knowledge_used: no
- useful_sources: none
- missing_sources: 缺少本机网络/GitHub 推送排障经验条目
- decisions: 直连/HTTP代理/SOCKS5 推送均在中途 curl 56 重置，小请求正常；判定为大文件(约20MB pptx)长连接上传被中断；经用户确认后将 pptx 提交从历史 rebase 丢弃、文件保留本地并加入 gitignore，随后推送成功
- validation: git push origin main 成功，远端 9a7ec6b..9c48afc
- reusable_asset: GitHub 大文件推送失败排障路径：先删大文件，再考虑代理/SSH
- suggested_destination: 项目运维经验
- confidence: high
- sensitive: no

### Knowledge Impact

- task: git push 推送大文件到 GitHub 连接被重置
- workflow: git 推送排障
- knowledge_level: K1
- useful_sources: none
- missing_sources: 缺少本机网络/GitHub 推送排障经验条目
- saved_explanation: unknown
- avoided_rework: unknown
- better_decision: unknown
- reusable_output: unknown
- next_update: none
