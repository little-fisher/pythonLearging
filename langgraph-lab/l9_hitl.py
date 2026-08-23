from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt,Command
from langchain_deepseek import ChatDeepSeek
from decouple import config
from langchain_core.messages import HumanMessage


# interrupt， 图内部，写在节点里，冻结：把状态存进 Checkpointer，本次 invoke 直接结束，把"信息"抛给外面的人看
# Command， 图外部，写在调用处	恢复：按 thread_id 找到冻结的快照，让 interrupt() 那行返回"答案"，图接着跑

model = ChatDeepSeek(model = 'deepseek-chat', api_key=config('DEEPSEEK_API_KEY'))

class myState(TypedDict):
    topic: str
    proposal: str
    decision: str

def generate(state: myState) -> myState:
    feedback = state.get('decision') or ''
    if feedback and feedback != '通过':
        promt = f"任务：{state['topic']}\n上次方案被打回，修改意见：{feedback}\n请给出改进后的方案。"
    else:
        promt = f"任务：{state['topic']}\n请给出一个简明100字方案。"
    reply = model.invoke([HumanMessage(content=promt)])
    return {'proposal': reply.content}

def review(state: myState)->myState:
    decision = interrupt({'proposal': state['proposal'], 'question': '通过还是打回？打回请写修改意见'})
    return {'decision': decision}

def route_decision(state: myState)->myState:
    if state['decision'] == '通过':
        return 'approved'
    else:
        return'rejected'

builder = StateGraph(myState)
builder.add_node(generate)
builder.add_node(review)
builder.add_edge(START, 'generate')
builder.add_edge('generate', 'review')
builder.add_conditional_edges('review', route_decision, {'approved': END, 'rejected': 'generate'})
graph = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "t1"}}

# ⑥ 第 1 次调用：出方案 → 冻结等审批
result = graph.invoke({"topic": "给公司产品想一个改进点", "proposal": "", "decision": ""}, config)
print('=== 待审批方案 ===')
print(result['__interrupt__'][0].value['proposal'])

# ⑦ 第 2 次调用：打回，带修改意见 → 图绕回 generate 重新生成 → 又冻结
result2 = graph.invoke(Command(resume='打回：太笼统，要具体到功能和预算'), config)
print('=== 修改后的方案 ===')
print(result2['__interrupt__'][0].value['proposal'])

# ⑧ 第 3 次调用：通过 → 图走到 END 结束
result3 = graph.invoke(Command(resume='通过'), config)
print('=== 审批完成 ===')
print(result3['decision'], result3['proposal'][:50])