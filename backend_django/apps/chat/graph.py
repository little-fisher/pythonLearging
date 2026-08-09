from langchain_deepseek import ChatDeepSeek
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import MessagesState
import pymysql
from langgraph.checkpoint.mysql.pymysql import PyMySQLSaver
from django.conf import settings
from langchain_core.messages import SystemMessage

MODEL = settings.DEEPSEEK_MODEL

model = ChatDeepSeek(model_name=MODEL, api_key=settings.DEEPSEEK_API_KEY)

def call_model(state: MessagesState) -> dict:
    messages = state["messages"]
    system_message = SystemMessage(content="你是一个专业的助手")
    response = model.invoke([system_message] + messages)
    return {"messages": [response]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)

DB_CONN = pymysql.connect(
    host=settings.DB_HOST,
    port=settings.DB_PORT,
    user=settings.DB_USER,
    password=settings.DB_PASSWORD,
    database=settings.DB_NAME,
    autocommit=True,
)

checkpoint = PyMySQLSaver(DB_CONN)
checkpoint.setup()

graph = builder.compile(checkpointer=checkpoint)


