# 第七期：MCP 服务 Demo

这个 Demo 把“作业上交情况”封装成标准 MCP 服务，包含：

- `Tools`：查询单个学员作业、列出某期已提交学员。
- `Resource`：读取某一期作业说明。
- `Prompt`：生成标准作业查询提问。
- `stdio`：本地 Host / IDE 接入。
- `Streamable HTTP`：远程服务化接入。

## 目录职责

```text
mcp_assignment_demo/
├── app/
│   ├── core/                 # .env 配置读取
│   ├── data/                 # 演示数据，可替换为数据库
│   ├── services/             # 业务逻辑，不依赖 MCP
│   ├── server.py             # stdio MCP Server
│   ├── http_server.py        # Streamable HTTP MCP Server
│   ├── langgraph_agent.py    # 使用 DeepSeek 调用 MCP 的 LangGraph Agent
│   └── langgraph_stdio_agent.py # 通过 stdio 调用本地 MCP 的 LangGraph Agent
├── configs/                  # 客户端配置示例
└── tests/                    # 业务层测试
```

## 安装与验证

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m unittest tests/test_assignment_service.py
```

## 启动方式

本地 stdio：

```bash
python -m app.server
```

将 `configs/mcp_client_config.json` 中的 `cwd` 改为本项目绝对路径后，交给支持 MCP 的 Host 使用。

Streamable HTTP：

```bash
uvicorn app.http_server:app --reload --port 8001
```

启动后，MCP 端点为 `http://127.0.0.1:8001/mcp`。

## 用 LangGraph Agent 调用 MCP

先复制环境变量模板，并填写 DeepSeek 密钥：

```bash
cp .env.example .env
```

保持 Streamable HTTP 服务运行：

```bash
uvicorn app.http_server:app --reload --port 8001
```

在新的终端调用 LangGraph Agent：

```bash
python -m app.langgraph_agent "朱艺第三期作业提交了吗？"
```

执行流程为：LangGraph 使用 `MultiServerMCPClient` 加载 `/mcp` 的 Tools，DeepSeek 决定是否调用 Tool，LangGraph 执行调用后再让模型根据结果生成回答。

运行时终端会输出完整数据流程：用户问题、MCP 连接、已发现 Tools、模型选择的 Tool、Tool 返回值和最终回复。可在 `.env` 中设置 `LOG_LEVEL=DEBUG` 查看更细的校验日志。

## 用 LangGraph Agent 通过 Stdio 调用本地 MCP

不需要启动 `uvicorn`。以下命令会在获取 Tool 和调用 Tool 时自动启动 `python -m app.server` 子进程，使用 stdin/stdout 建立 MCP 通信，并在调用结束后关闭：

```bash
python -m app.langgraph_stdio_agent "胡秋第一期作业提交了吗？"
```

Stdio 模式同样需要在 `.env` 中配置 `DEEPSEEK_API_KEY`。MCP 协议占用标准输出，因此 Server 中不能使用 `print()` 输出日志；本项目日志统一写入标准错误输出。

## 标准服务结构

MCP Server 只承担协议适配：Tool 注册、入参描述、权限校验、结果格式和审计。查询数据、数据库事务等业务规则应继续放在 `services/` 中，供 Web API、后台任务和 MCP 共用。
