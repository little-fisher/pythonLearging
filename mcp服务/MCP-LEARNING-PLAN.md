# MCP 学习计划（第七期）

> 依据《第七期_MCP服务.pptx》（17 页）+ 配套 demo `mcp_assignment_demo/` 整理。
> 衔接背景：已完成 langgraph-lab（Agent 基础）与 backend_django（DeepSeek 多轮对话项目）。
> 时间约束：周六开 skill 课，本计划按 **1~2 天突击**设计；Redis Day 4-7 顺延到课后插空。

---

## 总体路线

```
阶段一（今天）  MCP 概念 + 跑通 demo（单测 → stdio → HTTP → LangGraph Agent）   ✅ 已完成 2026-08-28
阶段二（今天晚/周六前）  精读 demo 代码，理解分层与协议细节                      ✅ 已完成 2026-08-28
阶段三（课后插空）  作业：把 backend_django 聊天项目升级为 MCP 调用              ⬜ 未开始
```

## 进度记录

**2026-08-29（阶段三进行中，完成步骤 1-2）**
- 环境：给 backend_django 建了独立 venv（之前借 langgraph-lab 的，其 mcp 是 2.x 不兼容 FastMCP 写法，钉 `mcp[cli]>=1.28,<2`）；依赖全集 `django djangorestframework python-decouple django-cors-headers django-redis openai pymysql langchain-deepseek langgraph langgraph-checkpoint-mysql mcp[cli] langchain-mcp-adapters`；新建 `.env`（DEEPSEEK_API_KEY + DB_PASSWORD=root）
- MySQL 用 Docker 新起：`docker run -d --name mysql8 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=agent_lab mysql:8`，migrate 已跑；Redis 用已有容器 `docker start redis`
- 完成 `backend_django/mcp_server/server.py` + `apps/chat/services.py`：FastMCP("chat-tools")，已注册 `get_current_time`、`search_sessions` 两个工具，printf 握手验证通过
- 踩坑记录：①薄壳与业务函数同名会覆盖 import → import 起别名 `_impl`；②ORM 对象不能直接返回，用 `.values()` 转 dict；③独立进程用 ORM 需 bootstrap：`os.environ.setdefault("DJANGO_SETTINGS_MODULE","config.settings")` + `django.setup()`，必须放在 apps import 之前；④FastMCP 异步架构 + Django ORM 同步闸 → 工具改 `async def` + `sync_to_async` 包装（Django 的闸是保护事件循环不被堵）
- 分层约定：server.py 只写协议适配薄壳，业务逻辑在 apps/chat/services.py
- 下次入口：步骤 3 给 services.py 加 `get_session_history(session_id)`（抄 views.py:73-86 快照逻辑，graph 从 .graph import）+ server.py 注册 `get_history` 工具；步骤 4 改造 graph.py 时注意"递归拉起"坑（server 进程 django.setup → apps.ready → import graph.py，若 graph.py 在 import 时就连 MCP server 会自己拉自己，需环境变量开关隔离）

**2026-08-28（阶段一 + 阶段二完成）**
- 环境：demo venv 重建 + 依赖 + `.env`（密钥从 langgraph-lab 复制）；Windows 下跑 agent 需加 `-X utf8`（GBK 控制台遇 ✅ 会 UnicodeEncodeError）
- 跑通：单测 2 个、stdio 握手（printf 发 JSON-RPC 验证 initialize/tools/list/resources/prompts）、HTTP + `langgraph_agent`、stdio 版 `langgraph_stdio_agent`
- 精读：data → service → server.py → http_server.py → 两个 agent + client 配置，五层全过完
- 动手题：新增 `get_phase_submission_rate` Tool（data 加 `CLASS_SIZE=10` 常量，service 加 `get_submission_rate`，server 注册薄壳，单测 1 个），stdio agent 实测模型自主选中新工具，返回第三期 30.0%
- 概念结论：Tool/Resource/Prompt 的判断轴是"触发主体"（模型/Host·用户/用户）而非读写；类型注解即契约；agent 逻辑与传输解耦（两版 agent 只差配置字典）；Skill（明天培训）= 给 AI 的 SOP，MCP 是产品能力、Skill 是开发规矩
- 下次入口：从下方"阶段三"开工，先建 `backend_django/mcp_server/`

---

## 阶段一 — 概念与跑通（对应 PPT 第 1~13 页）

**学习目标**
- 说清楚 MCP 解决什么问题：把已有业务能力以统一协议交给 AI 客户端，不是替代 Django/FastAPI
- 记住三层架构：Host（协调）→ Client（1:1 连接）→ Server（能力），通信基于 JSON-RPC 2.0
- 三类能力：Tools（模型自主调用的动作）/ Resources（可读取的上下文）/ Prompts（参数化模板）；先把 Tool 写好
- 一次工具调用四步：发现 → 决策（模型选）→ 确认（高风险人工确认）→ 执行（Server 落业务）
- 两种传输：stdio（本地子进程，日志只能写 stderr）vs Streamable HTTP（远程服务化）

**动手任务**
1. 环境准备：`mcp_assignment_demo` 重建 venv + 装依赖 + 配 `.env`（DEEPSEEK_API_KEY）
2. 按课件第 11 页的验证顺序跑通：
   - `python -m unittest tests/test_assignment_service.py`（业务层独立可测）
   - `python -m app.server`（stdio 服务能独立启动）
   - `uvicorn app.http_server:app --port 8001` + `python -m app.langgraph_agent "朱艺第三期作业提交了吗？"`
   - `python -m app.langgraph_stdio_agent "胡秋第一期作业提交了吗？"`
3. 观察 `[1/5]~[5/5]` 日志链路：用户问题 → 连接 MCP → 发现 Tools → 模型选 Tool → Tool 返回 → 生成回答

**自测问题**
- MCP 和"在提示词里约定函数调用格式"的区别是什么？
- 为什么模型不应该直接持有数据库权限？
- stdio 和 HTTP 两种传输怎么选型？

---

## 阶段二 — 精读源码（对应 PPT 第 8~10、16 页）

**学习目标**
- FastMCP 装饰器的两件事：注册 Tool + 从函数签名生成参数 Schema
- 好 Tool 的标准：名称清晰、docstring 写明适用场景和参数约束、入参校验抛可解释错误
- 标准分层：MCP 层（协议适配）→ services（业务规则，不依赖 MCP）→ data/ORM（数据访问）

**动手任务**
- 通读 `app/server.py`、`app/services/assignment_service.py`、`app/langgraph_agent.py`、`app/langgraph_stdio_agent.py`
- 看懂 `configs/mcp_client_config.json`（stdio 接入方式）
- （可选）给 demo 加一个新 Tool：例如 `get_phase_requirement` 已暴露为 Resource，试试把"统计某期提交率"封装成 Tool

---

## 阶段三 — 课程作业：改造 backend_django（对应 PPT 第 14~15 页）

**目标**：保留现有可视化聊天页面与 MySQL 会话记忆，给 Agent 接入 MCP，让**模型自主决策**调用外部能力。

**工具选型原则**：MCP Tool 应该是"模型在对话中自主决定要不要调"的能力，而不是前端/主机本来就该做的编排动作。
因此 `create_session` / `list_sessions`（用户在前端点选，属 Host 层编排）**不封装**，继续留在 Django REST 层给前端用——这恰好演示"MCP 不替代 Django"。

**步骤**
1. 新增 MCP Server（独立目录，如 `backend_django/mcp_server/`），封装至少 2 个 Tool：
   - `get_current_time()` 返回当前时间（热身 Tool，直接把 `backend/app/graph.py` 里那个本地工具搬过来，最快跑通链路）
   - `search_sessions(keyword)` 按关键词跨会话搜索（先搜 `Session.title` 即可）——补 checkpointer 的短板：它只给当前 thread 的历史，跨会话检索它没有
   - `get_history(session_id)` 读取指定会话历史（复用 `views.py` 里 `graph.get_state` 快照逻辑）——单独封它没意义（历史本来就在 checkpointer 里），但作为 `search_sessions` 的下一步，模型有真实的"搜到→点开看"决策链
   - （可选进阶）`save_note(content)` / `list_notes()`：跨会话长期记忆，需新建 `Note` 模型
2. 改造 `apps/chat/graph.py`：`MultiServerMCPClient` 加载 Tools + `create_react_agent(model, tools, checkpointer=...)`，替换现有手写 `call_tool` 节点的图
3. 验收：在原有页面问一个需要跨会话检索的问题（如"我们之前是不是聊过 Redis？"），观察到模型自主发起 `search_sessions` →（必要时）`get_history` 的 Tool 调用链，截图提交

**注意点**
- `get_tools()` 是异步的，Django 同步视图场景建议在启动时加载一次
- MCP Server 独立进程运行，不要塞进 Django；业务逻辑复用现有 service/ORM 层
- 对模型而言本地工具与 MCP 工具无感（看到的都是名称+schema），区别在工具侧：独立进程、动态发现（`tools/list`）、可被任意 MCP 客户端复用

---

## 参考资料

- PPT：`mcp服务/第七期_MCP服务.pptx`
- Demo：`mcp服务/mcp_assignment_demo/`（README 含完整启动说明）
- 官方文档：https://modelcontextprotocol.io/
- Python SDK：https://github.com/modelcontextprotocol/python-sdk
