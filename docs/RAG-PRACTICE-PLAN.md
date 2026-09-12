# RAG 作业重练计划

## 背景

- 作业成品已完成并在 `rag/`（可作为参考答案），要求见 `rag/README.md` 的验收对照表。
- 本计划的目标：在**新目录 `rag_practice/`** 从零重写一遍，真正学会流程，而不是抄。
- 规则：卡住超过 20 分钟 → 先翻 `rag/` 对应文件 → 再问 Agent。
- 预计 2~3 小时，分两次：第一次做第 1~4 步，第二次做第 5~6 步。

## 环境

```bash
cd /Users/aiyi/Documents/python项目/learning
mkdir -p rag_practice && touch rag_practice/__init__.py
# 解释器直接用现成的（依赖已装好）：
PY=backend_django/.venv/bin/python
# LLM key：cp rag/.env rag_practice/.env（第 5 步才需要）
```

## 第 1 步：数据（~10 分钟）

写 `rag_practice/knowledge.py`：≥20 条知识片段，每条含 `id / content / source / phase`。
要求：`phase` 至少 3 个不同值（基础/进阶/实战），内容可参考 `docs/` 里的真实笔记。

验证：
```bash
backend_django/.venv/bin/python -c "from rag_practice.knowledge import KNOWLEDGE; print(len(KNOWLEDGE), KNOWLEDGE[0].keys())"
```

## 第 2 步：Embedding（~15 分钟）

写 `rag_practice/embedding.py`，核心三行：
```python
from fastembed import TextEmbedding
model = TextEmbedding(model_name="BAAI/bge-small-zh-v1.5")
vec = list(model.embed(["测试句子"]))[0]
```

验证：打印 `len(vec)` 应得 **512**。加深理解：算"Redis 是内存数据库" vs "Redis 是内存型键值存储"的余弦相似度，再对比"Redis…" vs "今天天气不错"——前者应明显更大。

## 第 3 步：Milvus 入库（~20 分钟）

写 `rag_practice/ingest.py`，按顺序：
1. `MilvusClient(uri="rag_practice/milvus.db")`
2. `create_schema()` + `add_field`：id(INT64 主键)、vector(FLOAT_VECTOR, dim=512)、content/source/phase(VARCHAR)
3. `prepare_index_params()` + `add_index`(vector, AUTOINDEX, COSINE) + `create_collection`
4. 批量 embedding 所有 content，`insert`

验证：`get_collection_stats` 的 row_count 应等于数据条数。

## 第 4 步：检索（~15 分钟）

在 `ingest.py` 加 `search_milvus(question, top_k=3, expr=None)`：
- 问题用同一个 embedding 模型向量化
- `client.search(limit=top_k, filter=expr, output_fields=["content","source","phase"])`
- ⚠️ 检索前必须 `client.load_collection(...)`（新进程里集合是 released 状态）

验证：
```python
search_milvus("LangGraph 怎么暂停等人工确认？")                        # Top1 应命中 hitl 相关
search_milvus("LangGraph 怎么暂停等人工确认？", expr='phase == "基础"')  # 召回应全是"基础"
```

## 第 5 步：LangGraph 两节点（~20 分钟）

写 `rag_practice/rag_graph.py`：
1. `RagState(TypedDict)`：question / filter / contexts / answer / sources
2. `retrieve(state)`：调 search_milvus，返回 `{"contexts": [...]}`
3. `build_rag_prompt(question, contexts)`：上下文编号拼接 + "仅根据片段回答，末尾列来源"
4. `generate(state)`：`ChatDeepSeek` 调 DeepSeek（先 `cp rag/.env rag_practice/.env`，`load_dotenv`）
5. 建图：`StateGraph` → add_node × 2 → add_edge × 3（START→retrieve→generate→END）→ `compile()`

验证：`graph.invoke({"question": "Redis 怎么设过期时间？", "filter": None})` 得到带"来源："的回答。

## 第 6 步：demo 验收（~10 分钟）

写 `rag_practice/demo.py`：3 个问题循环跑图，打印召回明细 + 回答 + sources，其中至少一问带 `phase` 过滤。

收尾：对照 `rag/README.md` 验收表逐条打勾；把 embedding 模型名与实测维度写进 rag_practice 的 README。

## 进度记录

- [ ] 第 1 步 数据
- [ ] 第 2 步 Embedding
- [ ] 第 3 步 Milvus 入库
- [ ] 第 4 步 检索
- [ ] 第 5 步 LangGraph
- [ ] 第 6 步 demo 验收

> 做一步勾一步，新会话里 Agent 会按这里的勾选状态接续。
