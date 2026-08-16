from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class myState(TypedDict):
    n:int

def check(state: myState) -> myState:
    print(state['n'])
    return {}

def odd_node(state: myState) -> myState:
    return {'n': state['n'] * 3 + 1}

def even_node(state: myState) -> myState:
    return {'n': state['n'] // 2}

def route(state: myState) -> myState:
    if state['n'] == 1:
        return 'stop'
    if state['n'] % 2 == 0:
        return 'even'
    else:
        return 'odd'
        
builder = StateGraph(myState)
builder.add_node(check)
builder.add_node(odd_node)
builder.add_node(even_node)

builder.add_edge(START, 'check')
# 路标可以直接映射到 END
builder.add_conditional_edges('check', route, {'odd': 'odd_node', 'even': 'even_node', 'stop': END})
builder.add_edge('odd_node', 'check')
builder.add_edge('even_node', 'check')


graph = builder.compile()

result = graph.invoke({'n': 7})

print(result)
