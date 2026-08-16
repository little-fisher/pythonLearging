from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_deepseek import ChatDeepSeek
from langchain_core.messages import HumanMessage
from decouple import config
from langgraph.checkpoint.memory import InMemorySaver

model = ChatDeepSeek(model = 'deepseek-chat', api_key=config('DEEPSEEK_API_KEY'))

class myState(TypedDict):
    messages: Annotated[list, add_messages]

def call_model(state: myState) -> myState:
    reply = model.invoke(state['messages'])
    return {'messages': [reply]}

builder = StateGraph(myState)
builder.add_node(call_model)
builder.add_edge(START, 'call_model')
builder.add_edge('call_model', END)

graph = builder.compile(checkpointer=InMemorySaver())
cfg = {'configurable': {'thread_id': 'user-001'}}

# 第一轮：建立上下文
r1 = graph.invoke({'messages': [HumanMessage(content='用一句话介绍 LangGraph')]}, config=cfg)
print(r1['messages'][-1].pretty_repr())

# 第二轮：追问，考验记忆
r2 = graph.invoke({'messages': [HumanMessage(content='它有什么缺点？')]}, config=cfg)
print(r2['messages'][-1].pretty_repr())
