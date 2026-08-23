from langchain_core.tools import tool
from langchain_deepseek import ChatDeepSeek
from decouple import config
from datetime import datetime
from typing import Annotated,TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, START, END


class myState(TypedDict):
    messages: Annotated[list, add_messages]

    # ① 定义工具：普通函数 + @tool，docstring 很重要（模型靠它理解工具用途）
@tool
def get_current_time() -> str:
    """Get the current time"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ② bind_tools：让模型"知道"有工具可用
model = ChatDeepSeek(model = 'deepseek-chat', api_key=config('DEEPSEEK_API_KEY'))
model_with_tools = model.bind_tools([get_current_time])

def call_model(state: myState) -> myState:
    reply = model_with_tools.invoke(state['messages'])
    print('--- 1.call_model ---')
    print(reply.pretty_repr())
    return {'messages': [reply]}

def add_tools(state: myState) -> myState:
    call = state['messages'][-1].tool_calls[0]
    print('---2. call_tool ---')
    print('模型请求调用：', call['name'], '参数：', call['args'])

    result = get_current_time.invoke(call['args'])
    return {'messages': [ToolMessage(content=result, tool_call_id=call['id'])]}

def route_tools(state: myState) -> str:
     if state['messages'][-1].tool_calls:
        return 'has_tool'      # 模型想调工具 → 去 call_tool
     else:
        return 'done'

builder = StateGraph(myState)
builder.add_node('call_model', call_model)
builder.add_node('add_tools', add_tools)
builder.add_edge(START, 'call_model')
builder.add_conditional_edges('call_model', route_tools, {'has_tool': 'add_tools', 'done': END})
builder.add_edge('add_tools', 'call_model')

graph = builder.compile()
result = graph.invoke({'messages': [HumanMessage(content='What is the current time?')]})
print('=== 3.最终回答 ===')
print(result['messages'][-1].content)
