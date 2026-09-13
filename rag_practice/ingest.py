from pymilvus import DataType, MilvusClient  # MilvusClient 负责“操作数据”
from embedding import embed_texts
from knowledge import KNOWLEDGE
from pathlib import Path


COLLECTION = "course_knowledge"   # 集合名（相当于表名）
DB_PATH = "C:/milvus_rag/milvus.db"

def build_collection(client, dim):
    if client.has_collection(COLLECTION):
        client.drop_collection(COLLECTION)

    # 1) 定义 Schema
    schema = client.create_schema(auto_id=False, enable_dynamic_field=False) # 构造一个表结构描述对象 create_schema
    schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=32)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=dim)  # 文本嵌入向量，用于语义检索
    schema.add_field("content", DataType.VARCHAR, max_length=1024)
    schema.add_field("source", DataType.VARCHAR, max_length=256)
    schema.add_field("phase", DataType.VARCHAR, max_length=32)

    # 2) 定义索引
    index_params = client.prepare_index_params()
    index_params.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")  # 给 vector 字段建索引 index_type="AUTOINDEX"：让 Milvus 自动选择最合适的索引类型 metric_type="COSINE"：用余弦相似度作为距离度量

    client.create_collection(collection_name=COLLECTION, schema=schema, index_params=index_params)  # 建表 create_collection


def ingest():
    client = MilvusClient(uri=DB_PATH)     # 连库
    build_collection(client, 512)          # 建表

    vectors = embed_texts([item["content"] for item in KNOWLEDGE])  # 文本 → 向量
    rows = [{"id": item["id"], "vector": vec, "content": item["content"], "source": item["source"], "phase": item["phase"]}
            for item, vec in zip(KNOWLEDGE, vectors)] #zip(KNOWLEDGE, vectors)  →  (知识1, 向量1), (知识2, 向量2), (知识3, 向量3)保证每条知识和它自己的向量配对

    client.insert(collection_name=COLLECTION, data=rows)  # 写入向量与 metadata 到集合
    print(client.get_collection_stats(COLLECTION)["row_count"]) 

def search_milvus(question: str, top_k: int = 3, expr: str | None = None) -> list:
    """Top-K 检索，expr 传过滤表达式，如 'phase == "实战"'"""
    client = MilvusClient(uri=DB_PATH)
    client.load_collection(COLLECTION)
    vec = embed_texts([question])[0] #问题向量化
    res = client.search(
        collection_name=COLLECTION,
        data=[vec],
        limit=top_k,
        filter=expr,
        output_fields=["content", "source", "phase"],
    )
    return res[0]

if __name__ == "__main__":
    
   # 4) Top 3 检索验证
    # for q in ["Agent 的核心组成通常包括"]:
    #     print(f"\n问题: {q}")
    #     for i, hit in enumerate(search_milvus(q, top_k=3), 1):
    #         e = hit["entity"]
    #         print(f"  Top{i} (score={hit['distance']:.4f}) [{e['phase']}|{e['source']}] {e['content'][:40]}...")

    print(search_milvus("Agent 组成通常包括", expr='phase == "基础概念"'))