# graph.py —— Day 2：用 LangGraph 管理"对话状态"（记忆的地基）
#
# 一句话：把"调 DeepSeek 这一步"包装成图里的一个【节点】，
#         由 LangGraph 负责记住 messages（状态）并决定执行顺序（边）。
# 分工：main(路由层) -> graph(图/状态) -> ChatDeepSeek(调模型)
# P6 只建最小图：START -> call_model -> END（P7 会在这里加 Checkpointer 存记忆）
from decouple import config

from langchain_deepseek import ChatDeepSeek           # LangChain 的 DeepSeek 适配器（相当于 P3 的 OpenAI 客户端）
from langgraph.graph import StateGraph, START, END    # 图 + 两个内置特殊节点：入口 START / 出口 END
from langgraph.graph.message import MessagesState     # 官方消息状态：唯一键是 messages（复数）
import pymysql                                          # MySQL 驱动（D4-4）
from langgraph.checkpoint.mysql.pymysql import PyMySQLSaver  # MySQL 持久化 Checkpointer（D4-4）
from datetime import datetime
from langchain_core.tools import tool
from langchain_core.messages import ToolMessage


# 模型名仍从环境变量读，与 .env 保持一致
MODEL = config("DEEPSEEK_MODEL", default="deepseek-v4-flash")

# 创建模型实例：ChatDeepSeek 是"LangChain 版的 DeepSeek 客户端"
# 不传 api_key 时它会自动读 DEEPSEEK_API_KEY 环境变量（这里显式传，和 P3 写法一致更明确）
model = ChatDeepSeek(model=MODEL, api_key=config("DEEPSEEK_API_KEY"))
@tool
def get_current_time() -> str:
    """返回当前时间的字符串表示"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
model = model.bind_tools([get_current_time])

def call_tool(state: MessagesState) -> dict:
    last_message = state["messages"][-1]
    tools_map = {"get_current_time": get_current_time}
    outputs = []
    for call in last_message.tool_calls:
        # call 是 dict（不是对象）：{name, args, id, type}，用 [] 取值
        tool = tools_map[call["name"]]        # 按名字取出真正的函数
        result = tool.invoke(call["args"])    # 执行工具（args 是参数，这里为空）
        # 配对：tool_call_id 必须等于这个 tool_call 的 id，模型靠它认领结果
        outputs.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
    return {"messages": outputs}

def should_continue(state: MessagesState) -> str:
    """条件边路由函数：看模型的意图，决定下一步去哪。

    它读状态，返回一个"路名"字符串；图拿到路名后查映射表决定走向。
    （路名要和 add_conditional_edges 的映射表 key 一一对应）
    """
    last_message = state["messages"][-1]   # 取出模型刚生成的那条 AIMessage
    if last_message.tool_calls:            # 它带了 tool_calls = "想调工具"
        return "tools"                     # 路名 "tools" → 条件边带你去 call_tool
    return "end"                           # 路名 "end" → 正常回答，直接结束

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
builder.add_node("call_tool", call_tool)        # 注册节点：给工位起名 "tools" 并绑定函数
builder.add_edge(START, "call_model")        # 边①：入口 → 工位（invoke 从这里开始执行）

builder.add_conditional_edges(
    "call_model",  # 从工位 call_model 出发
    should_continue,  # 用这个函数判断下一步走哪条边
    {
        "tools": "call_tool",  # 如果 should_continue 返回 "tools"，就走到 call_tool 工位
        "end": END,            # 如果 should_continue 返回 "end"，就走到出口 END
    }
)

builder.add_edge("call_tool", "call_model")  # 边②：工具 → 工位（工具执行完再回到模型）
# 编译成可运行对象：之后 graph.invoke({...}) 会【沿着边】跑整条流水线，
# 走到节点才调用对应函数（声明式：你只管搭，执行顺序交给框架）。
# D4-4：Checkpointer 换成 MySQL 持久化 —— InMemorySaver 重启就丢，这个不会。
# 自己持有一条【持久连接】（不放进 with），进程存活期间一直复用。
DB_CONN = pymysql.connect(
    host=config("DB_HOST", default="127.0.0.1"),
    port=int(config("DB_PORT", default=3306)),
    user=config("DB_USER", default="root"),
    password=config("DB_PASSWORD", default="root"),
    database=config("DB_NAME", default="agent_lab"),
    autocommit=True,
)
checkpointer = PyMySQLSaver(DB_CONN)   # 用这条连接做记忆的"仓库"
checkpointer.setup()                  # 建 checkpoints 等表（已存在会自动跳过）
graph = builder.compile(checkpointer=checkpointer)
