from typing import Annotated, TypedDict

from langgraph.graph import StateGraph, START, END

def append_log(old:str, new:str) -> str:
    return old + '->' + new

class myState(TypedDict):
    value: int
    log: Annotated[str, append_log]

def set_num(state: myState) -> myState:
    return {'value': 10, 'log': 'set done'}

def add_ten(state: myState) -> myState:
    return {'value':state['value'] + 10, 'log': 'added'}

builder = StateGraph(myState)
builder.add_node(set_num)
builder.add_node(add_ten)
builder.add_edge(START, 'set_num')
builder.add_edge('set_num', 'add_ten')
builder.add_edge('add_ten', END)
graph = builder.compile()

result = graph.invoke({'value': 999, 'log': 'init'})
print(result)
