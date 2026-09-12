"""验收演示：3 个问题的端到端问答，回答包含 source，其中一问使用 phase 过滤。

运行：.venv/bin/python -m rag.demo   （在 backend_django 目录下，需先跑过 rag.ingest）
"""

from rag.rag_graph import run

CASES = [
    ("LangGraph 里怎么做人工确认再继续执行？", None),
    ("怎么给缓存设置过期时间？", None),
    ("怎么用向量数据库做一个带引用的问答？", 'phase == "实战"'),  # 使用 phase 过滤
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


if __name__ == "__main__":
    main()
