"""知识片段数据：不少于 20 条，含 id、content、source、phase 四个字段。

主题取自本学习仓库的真实课程内容（LangGraph、向量库、Python、Redis、Django），
phase 表示学习阶段：基础 / 进阶 / 实战。
"""

KNOWLEDGE = [
    {"id": 1, "content": "LangGraph 用 StateGraph 定义状态图，节点是函数，边决定执行顺序，最后调用 compile() 得到可运行的 graph。", "source": "langgraph-lab/l3_state.py", "phase": "基础"},
    {"id": 2, "content": "LangGraph 的 State 通常用 TypedDict 定义，节点返回的 dict 会合并进全局状态；需要累加的字段用 Annotated[list, add_messages] 这类 reducer。", "source": "langgraph-lab/l3_state.py", "phase": "基础"},
    {"id": 3, "content": "条件分支用 add_conditional_edges：给一个路由函数，根据 state 内容返回下一个节点名，实现 if/else 流程。", "source": "langgraph-lab/l4_branch.py", "phase": "进阶"},
    {"id": 4, "content": "LangGraph 的记忆通过 checkpointer 实现，thread_id 标识一次会话；同一 thread_id 多次 invoke 可以延续上下文。", "source": "langgraph-lab/l6_memory.py", "phase": "进阶"},
    {"id": 5, "content": "工具调用节点可以用 langgraph.prebuilt 的 ToolNode，把 LLM 返回的 tool_calls 自动执行并把结果写回 messages。", "source": "langgraph-lab/l7_tool.py", "phase": "进阶"},
    {"id": 6, "content": "interrupt() 可以在图执行中暂停，等待人工确认后用 Command(resume=...) 继续，这就是 human-in-the-loop。", "source": "langgraph-lab/l9_hitl.py", "phase": "实战"},
    {"id": 7, "content": "RAG 的核心思路：先把知识库切成片段并向量化存进向量库，提问时检索最相关的片段，再让 LLM 只基于这些片段回答。", "source": "第十期_向量库.pptx", "phase": "基础"},
    {"id": 8, "content": "Embedding 模型把文本映射为固定维度的向量，语义相近的文本向量距离更近；选型时要记录模型名和真实输出维度。", "source": "第十期_向量库.pptx", "phase": "基础"},
    {"id": 9, "content": "Milvus 建集合要先定义 Schema（字段与类型），再创建索引（如 IVF_FLAT 或 AUTOINDEX），然后写入向量与 metadata，最后才能 search。", "source": "第十期_向量库.pptx", "phase": "基础"},
    {"id": 10, "content": "Milvus 的 search 支持 expr 参数做标量过滤，例如 phase == '实战'，实现向量相似度与 metadata 过滤的混合检索。", "source": "第十期_向量库.pptx", "phase": "进阶"},
    {"id": 11, "content": "Milvus Lite 是 pymilvus 自带的本地向量库，MilvusClient 指向一个本地文件即可运行，不需要 Docker，适合作业和原型验证。", "source": "第十期_向量库.pptx", "phase": "基础"},
    {"id": 12, "content": "用 LangGraph 实现 RAG 的经典结构是 retrieve 和 generate 两个节点：retrieve 负责从 Milvus 召回上下文，generate 把上下文交给 LLM 生成带引用的回答。", "source": "第十期_向量库.pptx", "phase": "实战"},
    {"id": 13, "content": "RAG 的 prompt 要约束 LLM 仅使用给定上下文回答，并要求输出引用来源 source，检索不到时要明说不知道。", "source": "第十期_向量库.pptx", "phase": "实战"},
    {"id": 14, "content": "async def 定义协程，await 挂起等待异步结果；事件循环负责调度多个协程，asyncio.gather 可以并发跑多个协程。", "source": "python-notes-async-await.md", "phase": "基础"},
    {"id": 15, "content": "dict 取值的两种风格：d[key] 不存在会抛 KeyError，d.get(key, default) 可以带默认值安全取值。", "source": "python-notes-dict-access.md", "phase": "基础"},
    {"id": 16, "content": "python-dotenv 的 load_dotenv() 把 .env 文件加载进环境变量，代码里用 os.environ 读取，密钥不要提交进 git。", "source": "python-notes-dotenv-env.md", "phase": "基础"},
    {"id": 17, "content": "Redis 是内存键值数据库，常用作缓存和会话存储；Django 里用 django_redis 配置 CACHES 即可接入。", "source": "redis操作手册.md", "phase": "基础"},
    {"id": 18, "content": "Redis 的 SETEX 可以设置带过期时间的键，适合做验证码、token 等有过期语义的数据。", "source": "redis操作手册.md", "phase": "进阶"},
    {"id": 19, "content": "Django 的 MTV 结构：Model 管数据，Template 管页面，View 管逻辑；DRF 在 View 之上提供 Serializer 做序列化和校验。", "source": "DJANGO-CHEATSHEET.md", "phase": "基础"},
    {"id": 20, "content": "Django settings 里用 python-decouple 的 config() 读取环境变量，支持 default 和 cast，比直接 os.environ 更健壮。", "source": "DJANGO-CHEATSHEET.md", "phase": "进阶"},
    {"id": 21, "content": "MCP（Model Context Protocol）是 Anthropic 提出的开放协议，用统一的 server/client 方式给 LLM 提供工具和上下文。", "source": "MCP-LEARNING-PLAN.md", "phase": "进阶"},
    {"id": 22, "content": "FastMCP 可以用 Python 装饰器快速写一个 MCP server，@mcp.tool() 注册工具，stdio 或 SSE 方式对外服务。", "source": "mcp_assignment_demo", "phase": "实战"},
]
