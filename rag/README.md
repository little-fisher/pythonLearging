# 作业：用 LangGraph 实现 RAG

## 验收对照

| 要求 | 实现 |
| --- | --- |
| ≥20 条知识片段（id/content/source/phase） | `knowledge.py`，22 条，主题取自本仓库课程笔记 |
| Embedding：记录模型名与真实输出维度 | 模型 `BAAI/bge-small-zh-v1.5`（fastembed 本地运行），实测维度 **512**（`ingest.py` 启动时打印） |
| Milvus：Schema、索引、写入向量与 metadata、Top3 检索 | `ingest.py`：显式 schema（id/vector/content/source/phase）+ AUTOINDEX(COSINE)，入库后演示两个 Top3 检索 |
| LangGraph：retrieve、generate 两节点 | `rag_graph.py`：START → retrieve（Embedding + Milvus）→ generate（DeepSeek，仅用上下文回答）→ END |
| 3 问端到端、回答含 source、至少一次 phase/source 过滤 | `demo.py`：3 个问题，第 3 问使用 `phase == "实战"` 过滤 |

## 运行方式

```bash
cd /Users/aiyi/Documents/python项目/learning
python -m venv .venv
.venv/bin/pip install -r rag/requirements.txt
cp rag/.env.example rag/.env  # 填入 DeepSeek API Key
.venv/bin/python -m rag.ingest
.venv/bin/python -m rag.demo
```

## 说明

- 向量库用 **Milvus Lite**（pymilvus 自带，本地文件 `rag/milvus_rag.db`，无需 Docker）。
- LLM 用 DeepSeek，从 `rag/.env` 读取 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`。
- 新进程中检索前需 `load_collection()`（Milvus Lite 集合默认处于 released 状态）。
- 过滤通过 Milvus `search` 的 `filter` 参数实现，支持 `phase == "..."`、`source == "..."` 等标量表达式。
