KNOWLEDGE = [
    # ===== 基础概念 =====
    {
        "id": "K001",
        "content": "Agent 的核心组成通常包括：感知（Perception）、规划（Planning）、记忆（Memory）、工具调用（Tool Use）和执行（Action）。",
        "source": "LLM Agent 综述",
        "phase": "基础概念"
    },
    {
        "id": "K002",
        "content": "ReAct 模式将推理（Reasoning）与行动（Acting）交替进行，让模型在每一步先思考再决定调用哪个工具。",
        "source": "ReAct: Synergizing Reasoning and Acting in Language Models",
        "phase": "基础概念"
    },
    {
        "id": "K003",
        "content": "Agent 与普通 Chatbot 的关键区别在于：Agent 能自主拆解任务、调用外部工具并根据结果调整后续行为。",
        "source": "Agent 设计模式",
        "phase": "基础概念"
    },
    {
        "id": "K004",
        "content": "工具调用（Function Calling / Tool Use）让 Agent 能够访问搜索、数据库、代码执行等外部能力，突破纯文本生成的限制。",
        "source": "OpenAI Function Calling 文档",
        "phase": "基础概念"
    },
    {
        "id": "K005",
        "content": "Agent 的自主性可分为多个等级，从完全由人控制到完全自主执行，实际系统通常处于中间层级。",
        "source": "Agent 自主性分级实践",
        "phase": "基础概念"
    },
    {
        "id": "K006",
        "content": "一个典型 Agent 循环为：观察环境 → 思考推理 → 选择动作 → 执行工具 → 获取反馈 → 进入下一轮。",
        "source": "Agent 循环设计",
        "phase": "基础概念"
    },
    {
        "id": "K007",
        "content": "System Prompt 定义了 Agent 的角色、目标、约束和可用工具，是行为控制的第一道防线。",
        "source": "Prompt 工程实践",
        "phase": "基础概念"
    },
    {
        "id": "K008",
        "content": "Agent 的失败模式主要包括：幻觉、循环、工具误用、目标漂移和过早终止。",
        "source": "Agent 失败模式分析",
        "phase": "基础概念"
    },

    # ===== 记忆管理 =====
    {
        "id": "K009",
        "content": "短期记忆通常以对话上下文形式存在，长期记忆则通过向量数据库或外部存储实现跨会话持久化。",
        "source": "LangChain Memory 文档",
        "phase": "记忆管理"
    },
    {
        "id": "K010",
        "content": "向量检索（Embedding + 相似度搜索）是构建 Agent 长期记忆和 RAG 知识库的常用手段。",
        "source": "RAG 实践指南",
        "phase": "记忆管理"
    },
    {
        "id": "K011",
        "content": "上下文窗口有限，需要对历史对话进行摘要、裁剪或分层压缩，避免关键信息被挤出。",
        "source": "LangGraph 上下文管理",
        "phase": "记忆管理"
    },
    {
        "id": "K012",
        "content": "记忆写入需要判断信息是否值得长期保存，常见策略包括重要性打分、去重和定期整理。",
        "source": "MemGPT 论文",
        "phase": "记忆管理"
    },
    {
        "id": "K013",
        "content": "语义记忆存储事实性知识，情景记忆存储具体交互经历，二者在 Agent 中承担不同职责。",
        "source": "认知架构与 Agent 记忆",
        "phase": "记忆管理"
    },
    {
        "id": "K014",
        "content": "RAG 检索质量取决于分块策略、嵌入模型和重排序，单纯堆叠向量库并不能提升效果。",
        "source": "RAG 进阶实践",
        "phase": "记忆管理"
    },

    # ===== 任务规划 =====
    {
        "id": "K015",
        "content": "Plan-and-Execute 模式先让模型生成完整计划，再逐步执行，适合步骤较多、依赖明确的任务。",
        "source": "Plan-and-Solve Prompting",
        "phase": "任务规划"
    },
    {
        "id": "K016",
        "content": "任务分解（Task Decomposition）把复杂目标拆成可执行子任务，是 Agent 规划能力的基础。",
        "source": "Agent 设计模式",
        "phase": "任务规划"
    },
    {
        "id": "K017",
        "content": "多 Agent 协作可通过角色分工（如 Planner、Executor、Critic）提升复杂任务的处理质量。",
        "source": "AutoGen 论文",
        "phase": "任务规划"
    },
    {
        "id": "K018",
        "content": "反思（Reflection）机制让 Agent 检查自身输出并迭代改进，可显著提升复杂推理任务的准确率。",
        "source": "Reflexion 论文",
        "phase": "任务规划"
    },
    {
        "id": "K019",
        "content": "思维树（Tree of Thoughts）通过在多个推理分支上搜索和评估，提升复杂问题的求解能力。",
        "source": "Tree of Thoughts 论文",
        "phase": "任务规划"
    },
    {
        "id": "K020",
        "content": "动态规划要求 Agent 根据工具返回结果实时调整计划，而非死板执行初始步骤。",
        "source": "Agent 规划实践",
        "phase": "任务规划"
    },
    {
        "id": "K021",
        "content": "为计划设置明确的成功标准和终止条件，可以避免 Agent 在模糊目标下无限循环。",
        "source": "Agent 工程实践",
        "phase": "任务规划"
    },

    # ===== 工具调用 =====
    {
        "id": "K022",
        "content": "工具描述的质量直接影响 Agent 选择正确工具的概率，应明确说明用途、参数含义和返回格式。",
        "source": "Anthropic Tool Use 文档",
        "phase": "工具调用"
    },
    {
        "id": "K023",
        "content": "工具调用需要进行参数校验和错误处理，避免 Agent 因非法输入或超时导致整个流程崩溃。",
        "source": "Agent 工程实践",
        "phase": "工具调用"
    },
    {
        "id": "K024",
        "content": "为工具设计幂等性和超时重试机制，可以提升 Agent 在不可靠外部环境中的稳定性。",
        "source": "分布式系统设计原则",
        "phase": "工具调用"
    },
    {
        "id": "K025",
        "content": "MCP（Model Context Protocol）为 Agent 与外部工具、数据源之间提供了标准化的连接协议。",
        "source": "Anthropic MCP 文档",
        "phase": "工具调用"
    },
    {
        "id": "K026",
        "content": "工具数量过多会增加选择难度，可通过分组、路由或层级化工具检索来控制候选集。",
        "source": "Tool Retrieval 实践",
        "phase": "工具调用"
    },
    {
        "id": "K027",
        "content": "代码执行工具让 Agent 能进行精确计算和数据处理，但需在沙箱中运行以隔离风险。",
        "source": "Code Interpreter 实践",
        "phase": "工具调用"
    },
    {
        "id": "K028",
        "content": "工具返回结果应尽量结构化（如 JSON），便于模型稳定解析并减少幻觉。",
        "source": "Function Calling 最佳实践",
        "phase": "工具调用"
    },

    # ===== 评测优化 =====
    {
        "id": "K029",
        "content": "Agent 评测应覆盖任务成功率、工具调用正确率、步数效率和成本等多个维度。",
        "source": "AgentBench 论文",
        "phase": "评测优化"
    },
    {
        "id": "K030",
        "content": "提示词注入（Prompt Injection）是 Agent 面临的主要安全风险之一，外部内容可能劫持 Agent 行为。",
        "source": "OWASP LLM Top 10",
        "phase": "评测优化"
    },
    {
        "id": "K031",
        "content": "为 Agent 设置最小权限和人工确认节点，可以降低误操作和高风险工具调用的影响。",
        "source": "Agent 安全实践",
        "phase": "评测优化"
    },
    {
        "id": "K032",
        "content": "Agent 的成本主要来自 token 消耗和工具调用次数，优化上下文和减少无效循环是关键。",
        "source": "LLM 应用成本优化",
        "phase": "评测优化"
    },
    {
        "id": "K033",
        "content": "使用 LLM-as-a-Judge 对 Agent 输出进行自动评分，可以低成本地扩展评测规模。",
        "source": "LLM 评测实践",
        "phase": "评测优化"
    },
    {
        "id": "K034",
        "content": "轨迹评测（Trajectory Evaluation）关注 Agent 每一步的决策合理性，而不仅是最终答案。",
        "source": "Agent 评测方法",
        "phase": "评测优化"
    },
    {
        "id": "K035",
        "content": "建立回归测试集可以防止 Prompt 或工具变更导致 Agent 能力悄然退化。",
        "source": "LLM 应用持续评测",
        "phase": "评测优化"
    },

    # ===== 框架工程 =====
    {
        "id": "K036",
        "content": "LangGraph 用图结构描述 Agent 的状态流转，适合构建带循环、分支和中断恢复的复杂 Agent。",
        "source": "LangGraph 文档",
        "phase": "框架工程"
    },
    {
        "id": "K037",
        "content": "Agent 循环需要设置最大步数和终止条件，防止陷入无限调用或死循环。",
        "source": "Agent 工程实践",
        "phase": "框架工程"
    },
    {
        "id": "K038",
        "content": "可观测性对 Agent 至关重要，应记录每步的思考、工具调用、输入输出和耗时，便于调试。",
        "source": "LLM 可观测性实践",
        "phase": "框架工程"
    },
    {
        "id": "K039",
        "content": "人类在环（Human-in-the-Loop）允许在关键步骤暂停 Agent，由人工审核后再继续执行。",
        "source": "LangGraph Human-in-the-Loop",
        "phase": "框架工程"
    },
    {
        "id": "K040",
        "content": "状态机（State Machine）能显式建模 Agent 的各个状态和转移条件，提升流程可控性。",
        "source": "Agent 工作流设计",
        "phase": "框架工程"
    },
    {
        "id": "K041",
        "content": "Agent 应支持断点续跑和幂等恢复，避免长任务因单次失败而全部重来。",
        "source": "分布式任务编排",
        "phase": "框架工程"
    },
    {
        "id": "K042",
        "content": "将 Prompt、工具定义和业务逻辑解耦，便于独立迭代和测试各部分。",
        "source": "Agent 架构实践",
        "phase": "框架工程"
    },

    # ===== 多 Agent 协作 =====
    {
        "id": "K043",
        "content": "多 Agent 系统中，Orchestrator 负责调度和汇总，Worker Agent 负责具体子任务执行。",
        "source": "多 Agent 架构模式",
        "phase": "多 Agent 协作"
    },
    {
        "id": "K044",
        "content": "Agent 间通信需要约定消息格式和角色边界，否则容易出现职责重叠和无效对话。",
        "source": "AutoGen 实践",
        "phase": "多 Agent 协作"
    },
    {
        "id": "K045",
        "content": "对抗式协作（如 Generator 与 Critic 相互博弈）可以提升输出质量，但需控制收敛成本。",
        "source": "多 Agent 辩论方法",
        "phase": "多 Agent 协作"
    },
    {
        "id": "K046",
        "content": "多 Agent 并非越多越好，Agent 数量增加会带来通信开销和协调复杂度上升。",
        "source": "多 Agent 系统经验",
        "phase": "多 Agent 协作"
    },

    # ===== 生产部署 =====
    {
        "id": "K047",
        "content": "生产环境 Agent 需要限流、熔断和降级策略，避免上游模型或工具故障引发雪崩。",
        "source": "LLM 服务稳定性实践",
        "phase": "生产部署"
    },
    {
        "id": "K048",
        "content": "对 Agent 的关键决策进行审计日志记录，有助于合规审查和事后追溯。",
        "source": "AI 治理实践",
        "phase": "生产部署"
    },
    {
        "id": "K049",
        "content": "模型版本、Prompt 版本和工具版本的变更都应可追踪，并与评测结果关联。",
        "source": "MLOps 实践",
        "phase": "生产部署"
    },
    {
        "id": "K050",
        "content": "灰度发布 Agent 新版本时，应对比成功率、成本和用户反馈，再决定是否全量。",
        "source": "持续交付实践",
        "phase": "生产部署"
    }
]