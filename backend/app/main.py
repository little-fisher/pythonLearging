# main.py —— FastAPI 入口：定义 HTTP 路由
# 分工：main(路由层) -> deepseek_client(调模型) -> schemas(数据校验)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import ChatRequest, ChatResponse, ChatMessage
from .deepseek_client import chat_completion
from langchain_core.messages import HumanMessage
from .graph import graph

app = FastAPI() # 创建应用实例

# CORS：允许前端（localhost:5173）跨域调用本后端。来源是明确白名单，不放开任意来源。
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 健康检查：前端"测试连接"按钮只打这个接口，不产生模型费用
@app.get('/health') # 装饰器，注册一个路由：当有 GET /health 请求进来，就调用下面这个函数
def health() ->dict[str, str]: # 返回一个字典，键是 status，值是 ok
    return {"status": "ok", "service": "agent-lab-api"}

# 核心聊天接口：接收前端消息 → 拼多轮上下文 → 调 DeepSeek → 返回 assistant 回答
@app.post('/api/chat') # 装饰器，注册一个路由：当有 POST /api/chat 请求进来，就调用下面这个函数
def chat(req:ChatRequest) -> ChatResponse:
    # P8 分支：context_mode == graph_memory → 走 LangGraph 记忆
    if req.context_mode == "graph_memory":
        # P8 伪代码①：只把【当前 message】交给图，当作新的 HumanMessage。
        # 为什么只传这一句？历史已经在 Checkpointer 里了，再把 req.history 传一遍每轮都会重复。
        result = graph.invoke(
            {"messages": [HumanMessage(content=req.message)]},
            config={"configurable": {"thread_id": req.conversation_id}},  # conversation_id -> thread_id
        )
        # P8 伪代码②：从图结果最后一条 AIMessage 取 content（对象用点属性，不是 dict 下标）
        content = result["messages"][-1].content
        # P8 伪代码③：组装 ChatResponse（graph 模式拿不到 usage → None）
        return ChatResponse(
            conversation_id=req.conversation_id,
            message=ChatMessage(role="assistant", content=content),
            usage=None,
        )

    # P4 伪代码①：Day 1 只支持 client_history，其它模式明确拒绝
    if req.context_mode != "client_history":
        # 契约要求：不支持的上下文模式 → 400，并给出明确原因
        raise HTTPException(status_code=400, detail="Day 1 仅支持 client_history 模式")

    # P4 伪代码②：把 history（Pydantic 对象）转成 DeepSeek 需要的 role/content dict 列表
    message = [{"role": msg.role, "content": msg.content} for msg in req.history] # 把历史消息列表转换成 DeepSeek API 需要的格式
    # P4 伪代码③：末尾追加当前问题 —— 顺序保证"旧 → 新"，第二轮 history 不含这次 message，不会重复
    message.append({"role": "user", "content": req.message}) # 把当前问题也加进去

    # P4 伪代码④⑤：调用客户端；模型层失败要转成 502，且不泄漏敏感内容
    try:
        content, usage = chat_completion(message)
    except Exception:
        # 契约要求：模型层失败 → 502，且不把异常详情/Key/堆栈泄漏给浏览器
        raise HTTPException(status_code=502, detail="模型调用失败，请稍后重试")

    # P4 伪代码⑥：组装 ChatResponse（Pydantic 会自动把 usage 这个 dict 转成 UsageInfo）
    return ChatResponse(
        conversation_id=req.conversation_id,
        message=ChatMessage(role="assistant", content=content),
        usage=usage,
    )
