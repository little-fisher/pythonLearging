from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class myState(TypedDict):
    value: int

def double(state: myState) -> myState:
    print('double', state)
    return {'value': state['value'] * 2}

builder = StateGraph(myState)
builder.add_node(double)
builder.add_edge(START, 'double')
builder.add_edge('double', END)
graph = builder.compile()

result = graph.invoke({'value': 21})
print(result)
