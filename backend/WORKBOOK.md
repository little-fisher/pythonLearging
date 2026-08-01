# Python 后端手写练习册

目标不是抄出一个能跑的答案，而是每完成一张卡，都能解释“输入是什么、输出是什么、状态在哪里”。本目录故意没有 `.py` 文件。

## 准备

在 `backend/` 中执行：

```bash
# 1) 创建虚拟环境：用系统 Python 3 建一个独立目录 .venv/（隔离的 python/pip）
python3 -m venv .venv
# 2) 激活虚拟环境：把当前 shell 的 python/pip 指向 .venv/ 里的那份（状态在 shell 环境变量里）
source .venv/bin/activate
# 3) 安装依赖：用虚拟环境里的 pip 读取 requirements.txt，把包装进 .venv/（状态在 .venv/lib/）
python -m pip install -r requirements.txt
# 4) 生成本地配置：把 .env.example 复制成 .env，之后 API Key 填这里（状态在项目根目录的 .env 文件）
cp .env.example .env
```

然后自行创建：

```text
backend/
└── app/
    ├── __init__.py
    ├── main.py
    ├── schemas.py
    ├── deepseek_client.py
    └── graph.py              # Day 2 再创建
```

## P0｜50 分钟 Python 热身

只练项目会用到的语法：

| 前端经验 | Python 对应 | 练习 |
|---|---|---|
| JS object | `dict` | 写出一条 `{"role": "user", "content": "你好"}` |
| JS array | `list` | 创建 2 条消息并追加第 3 条 |
| TS type | 类型标注 / Pydantic Model | 给函数参数标注 `list[dict[str, str]]` |
| map/filter | 列表推导或 `for` | 取出所有 user 消息内容 |
| async function | `async def` / `await` | 写一个返回字符串的异步函数 |
| process.env | `os.getenv` | 读取一个不存在的变量并提供明确错误 |

自测题：

1. `history.append(message)` 会不会创建新列表？
2. `async def` 定义的函数为什么不能像普通函数一样直接得到结果？
3. 为什么 API Key 不应该出现在前端 JS？

## P1｜FastAPI 健康检查

在 `main.py` 亲手完成：

- 创建 `FastAPI` 应用；
- 添加 `GET /health`；
- 返回接口契约规定的两个字段；
- 用 Uvicorn 启动，打开 `/docs`。

启动目标：
# uvicorn 就是 .venv/bin/ 里那个可执行文件；app.main:app = "app 包里的 main.py 里的 app 对象"
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 
```

验收：

```bash
curl -i http://127.0.0.1:8000/health
```

必须看到 `HTTP/1.1 200 OK`。如果模块找不到，先确认终端当前目录是 `backend/`，不要急着改 import。

## P2｜Pydantic 模型

在 `schemas.py` 按 [接口契约](../docs/API-CONTRACT.md) 创建四个模型：

1. `ChatMessage`
2. `ChatRequest`
3. `UsageInfo`
4. `ChatResponse`

硬约束：

- 浏览器提交的 role 只能是 `user` 或 `assistant`；
- `history` 默认空列表，但不要使用一个会被所有实例共享的可变默认值；
- `usage` 允许为空；
- 不要直接用裸 `dict` 代替所有模型。

提示关键词：`BaseModel`、`Literal`、`Field(default_factory=list)`、`str | None`。

验收：先临时写一个只回显请求的 `/api/chat`。合法请求应为 `200`，把 `role` 改成 `system` 应为 `422`。

## P3｜DeepSeek 客户端

在 `deepseek_client.py` 写一个职责单一的函数：输入消息列表，输出“回答文本 + 可选 usage”。

你需要亲手完成的顺序：

1. 用 `load_dotenv()` 读取 `.env`；
2. 用 `os.getenv` 取 Key 和 Model；
3. 任一缺失时，在服务启动或首次调用时给出明确错误；
4. 创建官方 OpenAI 兼容客户端，Base URL 使用 `https://api.deepseek.com`；
5. 调用 chat completions；
6. 检查 choices 和 content 是否存在；
7. 只把安全、稳定的错误信息交给路由层。

不要做：把 Key 写在源码、把完整上游响应直接返回浏览器、在这个文件里处理 FastAPI Request。

单测式自验：先不接路由，在一个临时 REPL 或短入口里传固定 user message，确认终端能打印回答。验证后删掉临时入口。

## P4｜Day 1 多轮路由

在 `/api/chat` 中实现这段伪代码，不要直接复制成 Python：

```text
接收并校验 ChatRequest
如果 context_mode 不是 client_history -> 明确拒绝
把 request.history 变成普通 role/content 对象
在末尾追加当前 user message
调用 DeepSeek 客户端
组装 ChatResponse
模型层失败 -> 转换成 502，且不泄漏敏感内容
```

关键检查：发给 DeepSeek 的消息顺序必须是“旧 → 新”。第二轮请求的 `history` 不包含这次最新 `message`，避免重复。

## P5｜CORS 与前端联调

加入 `CORSMiddleware`，只允许：

- `http://localhost:5173`
- `http://127.0.0.1:5173`

然后在前端右侧切换到“FastAPI 联调”，点击“测试连接”。

验收顺序：

1. `/health` 为 200；
2. 浏览器 Network 中 `OPTIONS /api/chat` 没有失败；
3. `POST /api/chat` 为 200；
4. 页面出现真实回答；
5. 控制台没有 CORS error。

## P6｜Day 2 单节点 LangGraph

在 `graph.py` 创建最小图：

```text
START -> call_model -> END
```

要求：

- State 先用官方 `MessagesState`；
- `call_model` 是普通 Python 函数：读取 `state["messages"]`，调用模型，返回新的消息更新；
- 使用 `langchain-deepseek` 的模型适配，模型名仍从环境变量读取；
- 先在终端直接 `graph.invoke`，不要一上来就接 FastAPI。

解释题：为什么 Node 返回的是“局部更新”，而不是自己修改全局变量？

## P7｜Checkpointer 与 thread_id

给图加入 `InMemorySaver`，编译时传入 Checkpointer。每次调用图时配置：

```text
configurable.thread_id = conversation_id
```

验收必须包含两个 ID：

- `thread-a` 连续问两轮，第二轮能接上；
- `thread-b` 问相同追问，不能读到 A 的信息。

注意：`InMemorySaver` 在进程重启后会丢失，这是两天 Demo 的明确边界，不是 Bug。

## P8｜FastAPI 切换到 graph_memory

路由收到 `graph_memory` 时：

```text
只把当前 message 作为新的 HumanMessage 交给图
conversation_id -> thread_id
从图结果最后一条 AIMessage 取 content
组装原来的 ChatResponse
```

禁止把浏览器发来的完整 history 再追加给有 Checkpointer 的图，否则每一轮都会重复。

## 最后口试

不看文档回答：

1. 前端窗口 ID、DeepSeek messages、LangGraph thread_id 有什么关系？
2. Day 1 的记忆放在哪里？Day 2 的记忆放在哪里？
3. FastAPI、LangGraph、DeepSeek 各自只负责什么？
4. 为什么 `InMemorySaver` 不能直接当生产数据库？
5. 下一步加工具调用时，应该新增什么 Node，Edge 如何决定是否进入它？

能清楚回答 4/5，才进入第三天扩展。

