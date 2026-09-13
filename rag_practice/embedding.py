from fastembed import TextEmbedding # 文本 → 向量

model = TextEmbedding(model_name="BAAI/bge-small-zh-v1.5")

def embed_texts(texts: list[str]) -> list[list[float]]:
    """文本列表 → 向量列表"""
    return [v.tolist() for v in model.embed(texts)]

