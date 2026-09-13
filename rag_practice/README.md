
## 验收对照

| 要求 | 实现 |
| --- | --- |
| ≥20 条知识片段（id/content/source/phase） | `knowledge.py`，50 条，字符串主键（K001…），主题取自 Agent/LLM 学习笔记 |
| Embedding：模型名与实测维度 | `embedding.py`：`BAAI/bge-small-zh-v1.5`（fastembed 本地运行），实测维度 **512** |
| Milvus：Schema、索引、写入、Top3 检索 | `ingest.py`：schema（id/vector/content/source/phase）+ AUTOINDEX(COSINE)；`search_milvus` 支持 Top-K 与标量过滤 |
| LangGraph：retrieve、generate 两节点 | `rag_graph.py`：START → retrieve（Embedding + Milvus）→ generate（DeepSeek，仅按片段回答）→ END |
| 3 问端到端、含来源、至少一次过滤 | `demo.py`：3 问，Q3 带 `phase == "工具调用"` 过滤 |

## 运行方式（Windows / PowerShell）

```powershell
# 一次性准备
python -m venv rag_practice/.venv
rag_practice/.venv/Scripts/python.exe -m pip install -r rag/requirements.txt
# 复制 rag/.env 为 rag_practice/.env 并填入 DEEPSEEK_API_KEY；模型用 deepseek-chat

cd rag_practice
.venv\Scripts\Activate.ps1
python ingest.py      # 入库（__main__ 放开 ingest()），输出 50
python ingest.py      # 检索（__main__ 放开检索部分）
python rag_graph.py   # 单问端到端
python demo.py        # 3 问验收
```

## 关键实现说明

- 向量库：**Milvus Lite**（pymilvus 自带，本地文件 `C:/milvus_rag/milvus.db`，无需 Docker）。
- LLM：DeepSeek，从 `rag_practice/.env` 读 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`。
- 检索前需 `client.load_collection(...)`（新进程中集合默认 released）。
- 过滤走 `client.search` 的 `filter` 参数，如 `phase == "工具调用"`。
- 防幻觉两道锁：prompt 写明"仅根据片段回答，不足就说不知道" + `temperature=0`。

