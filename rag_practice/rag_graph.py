import os
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from langchain_deepseek import ChatDeepSeek
from langgraph.graph import END, START, StateGraph

from ingest import search_milvus

load_dotenv(Path(__file__).parent / ".env")

class RagState(TypedDict, total=False):
    question: str
    filter: str | None          # Milvus 标量过滤表达式，如 phase == "实战"
    contexts: list[dict]        # retrieve 召回的片段（含 content/source/phase）
    sources: list[str]
    answer: str

_llm: ChatDeepSeek | None = None
# 全局 LLM 实例，避免每次调用都创建。
def get_llm() -> ChatDeepSeek:
    global _llm
    if _llm is None:
        _llm = ChatDeepSeek(
            model=os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            api_key=os.environ["DEEPSEEK_API_KEY"],
            temperature=0,
        )
    return _llm

# 拿用户问题去 search_milvus 查最相似的 3 条
def retrieve(state: RagState) -> dict:
    hits = search_milvus(state["question"], top_k=3, expr=state.get("filter"))
    contexts = [
        {"content": h["entity"]["content"], "source": h["entity"]["source"],
         "phase": h["entity"]["phase"], "score": round(h["distance"], 4)}
        for h in hits
    ]
    return {"contexts": contexts}

#把检索到的片段编号、标上来源和阶段，塞进 Prompt
def build_rag_prompt(question: str, contexts: list[dict]) -> str:
    blocks = "\n".join(
        f"[{i}] (source: {c['source']}, phase: {c['phase']}) {c['content']}"
        for i, c in enumerate(contexts, 1) #遍历的同时给编号
    )
    return (
        "你是课程助教。仅根据下面的知识片段回答问题，不要使用外部知识；"
        "片段不足以回答时明确说不知道。回答末尾用「来源：」列出用到的 source。\n\n"
        f"知识片段：\n{blocks}\n\n问题：{question}"
    )

def generate(state: RagState) -> dict:
    if not state["contexts"]:
        return {"answer": "知识库中没有检索到相关内容，无法回答。", "sources": []}
    prompt = build_rag_prompt(state["question"], state["contexts"])
    answer = get_llm().invoke(prompt).content
    sources = sorted({c["source"] for c in state["contexts"]})
    return {"answer": answer, "sources": sources}

workflow = StateGraph(RagState)
workflow.add_node("retrieve", retrieve)
workflow.add_node("generate", generate)
workflow.add_edge(START, "retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)
graph = workflow.compile()

def run(question: str, filter_expr: str | None = None) -> RagState:
    return graph.invoke({"question": question, "filter": filter_expr})



# 文件末尾加，或直接 python -c
# if __name__ == "__main__":
#     result = run("System Prompt 的作用是什么？")
#     print(result["answer"])
#     print(result["sources"])