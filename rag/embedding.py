"""Embedding 封装：fastembed 本地中文模型，供入库与检索共用。"""

from fastembed import TextEmbedding

# bge-small-zh-v1.5 官方标称 512 维；真实维度以 probe 实测为准（见 ingest.py 输出）
EMBEDDING_MODEL_NAME = "BAAI/bge-small-zh-v1.5"

_model: TextEmbedding | None = None


def get_embedder() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=EMBEDDING_MODEL_NAME)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in get_embedder().embed(texts)]


def probe_dim() -> int:
    """实测输出维度：对一条探针文本做 embedding 并取向量长度。"""
    return len(embed_texts(["维度探针"])[0])
