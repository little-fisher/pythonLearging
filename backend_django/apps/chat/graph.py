from decouple import config as env_config
from langchain_deepseek import ChatDeepSeek
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import MessagesState
import pymysql
from langgraph.checkpoint.mysql.pymysql import PyMySQLSaver


MODEL = env_config("DEEPSEEK_MODEL", default="deepseek-v4-flash")

model = ChatDeepSeek(model_name=MODEL, api_key=env_config("DEEPSEEK_API_KEY"))

def call_model(state: MessagesState) -> dict:
    messages = state["messages"]
    response = model.invoke(messages)
    return {"messages": [response]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)

DB_CONN = pymysql.connect(
    host=env_config("DB_HOST", default="localhost"),
    port=env_config("DB_PORT", default=3306, cast=int),
    user=env_config("DB_USER", default="root"),
    password=env_config("DB_PASSWORD", default=""),
    database=env_config("DB_NAME", default="chat"),
    autocommit=True,
)

checkpoint = PyMySQLSaver(DB_CONN)
checkpoint.setup()

graph = builder.compile(checkpointer=checkpoint)


