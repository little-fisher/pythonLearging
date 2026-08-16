from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_deepseek import ChatDeepSeek
from langchain_core.messages import HumanMessage
from decouple import config

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

graph = builder.compile()
result = graph.invoke({'messages': [HumanMessage(content='它有什么缺点')]})

print(result['messages'])
# result['messages'] 是 [HumanMessage, AIMessage] 
