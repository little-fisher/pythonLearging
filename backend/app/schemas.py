# schemas.py —— 接口契约的"数据模型"（Pydantic）
#
# 作用：FastAPI 收到请求 JSON 后，会先按这些模型做【运行期校验】，
#       校验不过直接返回 422，路由函数根本不会被调用。

# 标准库 typing 的 Literal：限制字段只能是列出的那几个具体值
from typing import Literal
# 第三方库 pydantic：BaseModel 是模型的基类，Field 给字段加约束
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """单条对话消息。"""
    role: Literal["user", "assistant"]    # 只允许这两个值，浏览器不能提交 system
    content: str = Field(min_length=1)    # 内容至少 1 个字符


class ChatRequest(BaseModel):
    """前端 POST /api/chat 的请求体。"""
    conversation_id: str                        # 会话 ID，必填，同一个页面会话保持不变
    message: str = Field(min_length=1)          # 当前问题，必填，至少 1 个字符
    # 历史消息列表，默认空列表。
    # 注意：用 default_factory=list，而不是 = []，
    # 否则所有实例会共享同一个列表（可变默认值陷阱，呼应 id() 笔记）
    history: list[ChatMessage] = Field(default_factory=list)
    context_mode: Literal["client_history", "graph_memory"] = "client_history"  # Day1 用前者，Day2 切后者
    # D4-3 ②：可选标题 —— 前端把会话标题带来，后端懒创建时用它写库（不传则回落"未命名会话"）
    title: str | None = None


class UsageInfo(BaseModel):
    """DeepSeek 返回的 token 用量（可选）。"""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatResponse(BaseModel):
    """POST /api/chat 的响应体。"""
    conversation_id: str
    message: ChatMessage                 # 嵌套模型：assistant 的回答
    usage: UsageInfo | None = None       # 允许为空：不是所有模型/分支都返回用量