"""入库脚本：Embedding + Milvus 建 Schema、索引、写入向量与 metadata、Top3 检索验证。

运行：.venv/bin/python -m rag.ingest   （在 backend_django 目录下）
"""

from pathlib import Path

from pymilvus import DataType, MilvusClient

from rag.embedding import EMBEDDING_MODEL_NAME, embed_texts, probe_dim
from rag.knowledge import KNOWLEDGE

COLLECTION = "course_knowledge"
DB_PATH = str(Path(__file__).parent / "milvus_rag.db")  # Milvus Lite 本地文件


def get_client() -> MilvusClient:
    return MilvusClient(uri=DB_PATH)


def build_collection(client: MilvusClient, dim: int) -> None:
    if client.has_collection(COLLECTION):
        client.drop_collection(COLLECTION)

    # 1) 定义 Schema
    schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=dim)
    schema.add_field("content", DataType.VARCHAR, max_length=1024)
    schema.add_field("source", DataType.VARCHAR, max_length=256)
    schema.add_field("phase", DataType.VARCHAR, max_length=32)

    # 2) 定义索引
    index_params = client.prepare_index_params()
    index_params.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")

    client.create_collection(collection_name=COLLECTION, schema=schema, index_params=index_params)


def ingest() -> None:
    dim = probe_dim()
    print(f"Embedding 模型: {EMBEDDING_MODEL_NAME}, 实测输出维度: {dim}")

    client = get_client()
    build_collection(client, dim)

    # 3) 写入向量与 metadata
    vectors = embed_texts([item["content"] for item in KNOWLEDGE])
    rows = [
        {"id": item["id"], "vector": vec, "content": item["content"],
         "source": item["source"], "phase": item["phase"]}
        for item, vec in zip(KNOWLEDGE, vectors)
    ]
    client.insert(collection_name=COLLECTION, data=rows)
    print(f"已写入 {client.get_collection_stats(COLLECTION)['row_count']} 条知识片段")


def search_milvus(question: str, top_k: int = 3, expr: str | None = None) -> list[dict]:
    """Top-K 检索，expr 传 Milvus 标量过滤表达式，如 phase == "实战"。"""
    client = get_client()
    client.load_collection(COLLECTION)  # 新进程中集合处于 released 状态，检索前需 load
    vec = embed_texts([question])[0]
    res = client.search(
        collection_name=COLLECTION,
        data=[vec],
        limit=top_k,
        filter=expr,
        output_fields=["content", "source", "phase"],
    )
    return [hit for hit in res[0]]


if __name__ == "__main__":
    ingest()

    # 4) Top 3 检索验证
    for q in ["LangGraph 怎么实现人机交互暂停？", "Redis 怎么做带过期时间的缓存？"]:
        print(f"\n问题: {q}")
        for i, hit in enumerate(search_milvus(q, top_k=3), 1):
            e = hit["entity"]
            print(f"  Top{i} (score={hit['distance']:.4f}) [{e['phase']}|{e['source']}] {e['content'][:40]}...")
