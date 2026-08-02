# graph.py —— Day 2：用 LangGraph 管理"对话状态"（记忆的地基）
#
# 一句话：把"调 DeepSeek 这一步"包装成图里的一个【节点】，
#         由 LangGraph 负责记住 messages（状态）并决定执行顺序（边）。
# 分工：main(路由层) -> graph(图/状态) -> ChatDeepSeek(调模型)
# P6 只建最小图：START -> call_model -> END（P7 会在这里加 Checkpointer 存记忆）

import os

from dotenv import load_dotenv                        # 读 backend/.env（和 deepseek_client 一样）
from langchain_deepseek import ChatDeepSeek           # LangChain 的 DeepSeek 适配器（相当于 P3 的 OpenAI 客户端）
from langgraph.graph import StateGraph, START, END    # 图 + 两个内置特殊节点：入口 START / 出口 END
from langgraph.graph.message import MessagesState     # 官方消息状态：唯一键是 messages（复数）
from langgraph.checkpoint.memory import InMemorySaver  # 内存存储器：P7 会在这里加 Checkpointer，让图能存/恢复历史

load_dotenv()

# 模型名仍从环境变量读，与 .env 保持一致
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# 创建模型实例：ChatDeepSeek 是"LangChain 版的 DeepSeek 客户端"
# 不传 api_key 时它会自动读 DEEPSEEK_API_KEY 环境变量（这里显式传，和 P3 写法一致更明确）
model = ChatDeepSeek(model=MODEL, api_key=os.getenv("DEEPSEEK_API_KEY"))

def call_model(state: MessagesState) -> dict:
    """一个节点 = 一个工位：输入【整个状态】，输出【局部更新】。

    图状态里唯一的键叫 messages（复数），存的是"到目前为止的全部消息"：
    历史 + 本次提问（invoke 时放进去的）。这一步只做一件事：
    读上下文 → 调模型 → 返回新回答。
    """
    messages = state["messages"]        # ① 从"传送带"取出全部消息（历史+本次提问），当作上下文
    response = model.invoke(messages)   # ② 模型读完上下文，【新生成】一条 AIMessage（不是把历史还回来）
    return {"messages": [response]}     # ③ 局部更新：往 messages 里【追加】这一条，合并由框架自动做

# 搭图三件套：State（状态类型）→ Node（工位）→ Edge（传送方向）
builder = StateGraph(MessagesState)          # 声明图的"状态类型" = 官方消息状态（传送带装的是消息列表）
builder.add_node("call_model", call_model)   # 注册节点：给工位起名 "call_model" 并绑定函数
builder.add_edge(START, "call_model")        # 边①：入口 → 工位（invoke 从这里开始执行）
builder.add_edge("call_model", END)          # 边②：工位 → 出口（干完活结束）

# 编译成可运行对象：之后 graph.invoke({...}) 会【沿着边】跑整条流水线，
# 走到节点才调用对应函数（声明式：你只管搭，执行顺序交给框架）。
# P7 会在 compile() 里传入 Checkpointer（InMemorySaver），让图能存/恢复历史。
checkpoint = InMemorySaver()
graph = builder.compile(checkpointer=checkpoint)
