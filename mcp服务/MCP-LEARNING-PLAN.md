# MCP 学习计划（第七期）

> 依据《第七期_MCP服务.pptx》（17 页）+ 配套 demo `mcp_assignment_demo/` 整理。
> 衔接背景：已完成 langgraph-lab（Agent 基础）与 backend_django（DeepSeek 多轮对话项目）。
> 时间约束：周六开 skill 课，本计划按 **1~2 天突击**设计；Redis Day 4-7 顺延到课后插空。

---

## 总体路线

```
阶段一（今天）  MCP 概念 + 跑通 demo（单测 → stdio → HTTP → LangGraph Agent）
阶段二（今天晚/周六前）  精读 demo 代码，理解分层与协议细节
阶段三（课后插空）  作业：把 backend_django 聊天项目升级为 MCP 调用
```

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

**目标**：保留现有可视化聊天页面与 MySQL 会话记忆，让 Agent改为通过 MCP 管理和查询会话。

**步骤**
1. 新增 MCP Server（可放 `backend_django/apps/` 下或独立目录），封装至少 2 个 Tool：
   - `create_session(title)` 创建会话
   - `list_sessions()` 查询会话列表
   - `get_history(session_id)` 读取历史消息（复用 PyMySQLSaver 快照逻辑）
2. 改造 `apps/chat/graph.py`：`MultiServerMCPClient` 加载 Tools + `create_react_agent(model, tools, checkpointer=...)`
3. 验收：在原有页面完成一次 MCP Tool 调用（切换对话窗口并展示历史消息），截图提交

**注意点**
- `get_tools()` 是异步的，Django 同步视图场景建议在启动时加载一次
- MCP Server 独立进程运行，不要塞进 Django；业务逻辑复用现有 service/ORM 层

---

## 参考资料

- PPT：`mcp服务/第七期_MCP服务.pptx`
- Demo：`mcp服务/mcp_assignment_demo/`（README 含完整启动说明）
- 官方文档：https://modelcontextprotocol.io/
- Python SDK：https://github.com/modelcontextprotocol/python-sdk
