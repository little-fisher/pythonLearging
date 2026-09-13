from rag_graph import run

CASES = [
    ("System Prompt 的作用是什么？", None),
    ("LangGraph 里怎么做人工确认再继续执行？", None),
    ("工具数量过多会怎么样", 'phase == "工具调用"'),  # 使用 phase 过滤
]

def main() -> None:
    for i, (question, filter_expr) in enumerate(CASES, 1):
        state = run(question, filter_expr)
        print("=" * 70)
        print(f"Q{i}: {question}" + (f"   [filter: {filter_expr}]" if filter_expr else ""))
        print(f"召回 {len(state['contexts'])} 条: "
              + ", ".join(f"{c['source']}({c['phase']}, {c['score']})" for c in state["contexts"]))
        print(f"回答: {state['answer']}")
        print(f"sources: {state['sources']}")

main()