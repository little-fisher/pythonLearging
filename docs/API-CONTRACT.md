# 前后端接口契约 v1

这份文件是第一版前后端唯一字段依据。先保持简单、非流式；等三项作业目标全部通过后，再增加 SSE。

## 请求链

```text
浏览器当前会话
  -> POST /api/chat
  -> FastAPI 校验 Pydantic DTO
  -> Day 1: 拼接 history 后调用 DeepSeek
  -> Day 2: 以 conversation_id 作为 LangGraph thread_id
  -> 返回一条 assistant 消息
```

DeepSeek `/chat/completions` 是无状态 API，服务端不会替你记住上一轮。因此 Day 1 必须显式把历史消息再次传给模型。Day 2 使用 LangGraph Checkpointer 后，由图按 `thread_id` 保存短期状态；届时前端仍保留 `history` 用于观察，但后端不得把相同历史重复追加进图。

## `GET /health`

成功响应：

```json
{
  "status": "ok",
  "service": "agent-lab-api"
}
```

用途：前端“测试连接”按钮只检查 FastAPI 是否可访问，不调用 DeepSeek，不产生模型费用。

## `POST /api/chat`

请求：

```json
{
  "conversation_id": "conv-8dc7...",
  "message": "我刚才说了什么？",
  "history": [
    {
      "role": "user",
      "content": "记住：我叫小林，我在学习 Python"
    },
    {
      "role": "assistant",
      "content": "好的，我会在当前会话中记住。"
    }
  ],
  "context_mode": "client_history"
}
```

字段约束：

| 字段 | 类型 | 规则 |
|---|---|---|
| `conversation_id` | `str` | 必填，同一个页面会话保持不变 |
| `message` | `str` | 必填，去除首尾空格后至少 1 个字符 |
| `history` | `list[ChatMessage]` | Day 1 为当前消息之前的历史，可为空 |
| `history[].role` | `Literal["user", "assistant"]` | 第一版不允许浏览器提交 `system` |
| `history[].content` | `str` | 至少 1 个字符 |
| `context_mode` | `Literal["client_history", "graph_memory"]` | Day 1 使用前者，Day 2 切到后者 |

成功响应：

```json
{
  "conversation_id": "conv-8dc7...",
  "message": {
    "role": "assistant",
    "content": "你刚才说你叫小林，正在学习 Python。"
  },
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 18,
    "total_tokens": 60
  }
}
```

`usage` 可以为空，因为不同模型或异常分支不一定返回完整用量。前端当前只依赖 `message.role` 和 `message.content`。

## Day 1 与 Day 2 的上下文规则

| 模式 | 后端收到后怎么做 | 禁止做什么 |
|---|---|---|
| `client_history` | `history + 当前 user message` 一次性发给 DeepSeek | 不要只发当前问题，否则第二轮失忆 |
| `graph_memory` | 只把当前 user message 传入 graph，并用 `conversation_id` 配置 `thread_id` | 不要再把 `history` 全量追加，否则内容重复 |

切换到 Day 2 时，在前端设置面板把“上下文策略”改为 `graph_memory`。这个显式开关是为了让你能观察两种机制，不是生产系统的最终设计。

## 错误响应

FastAPI/Pydantic 自带的 `422` 用于字段校验错误。你还需要把模型调用错误收敛为可读的 HTTP 错误：

| 状态码 | 场景 | 前端期望 |
|---|---|---|
| `400` | 空消息或不支持的上下文模式 | 展示明确原因 |
| `502` | DeepSeek 请求失败或响应格式异常 | 保留用户消息，允许重试 |
| `500` | 未预期异常 | 不把 API Key、堆栈或上游完整响应返回浏览器 |

## CORS

前端使用 `http://localhost:5173`，后端使用 `http://localhost:8000`，它们是不同 Origin。FastAPI 只允许学习环境需要的明确来源：

```text
http://localhost:5173
http://127.0.0.1:5173
```

不要为了省事把带凭证的 CORS 配成任意来源。

