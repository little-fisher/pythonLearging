# LangGraph 从零学习计划（langgraph-lab）

> 定位：**从零开始**系统学习 LangGraph，不预设任何前置知识。
> 之前 FastAPI/Django 里接触过，但感觉没学透——这次每一关都把"为什么"讲透。
> 学习风格：手写练习，先给脚手架让用户亲手敲、加中文注释，逐关验收。
> 每关验收：能回答 **输入是什么、输出是什么、状态在哪里**。

---

## 课程哲学

LangGraph 的核心就一个比喻：**流水线/工位/传送带**。

```
传送带（State）→ 工位1（Node）→ 传送带 → 工位2（Node）→ ... → 出口
```

学透它 = 学透三件事：**状态（传送带上装什么）、节点（工位干什么）、边（怎么走）**。
本课程围绕这三件事层层深入。

---

## 课程结构（从零到进阶）

### L1｜先理解"图"是什么（1.5 小时）
**目标**：不写代码，先建立心智模型。

- L1-1 为什么需要 LangGraph（对比直接调模型）
  - 直接调模型：`model.invoke(messages)` 一条路走到底
  - 用图：能分叉、能循环、能记住状态
- L1-2 三个核心概念 + 大象装冰箱类比
  - State（传送带）、Node（工位）、Edge（路线）
- L1-3 在你的语言里找例子：你现有 Django 项目里的 `graph.py` 就是最小例子
- 验收：能画出"把大象装冰箱"的 mermaid，并指出哪个是 State/Node/Edge

### L2｜搭第一个最小图（2 小时）
**目标**：手写 START → 节点 → END，跑通第一次 invoke。

- L2-1 环境准备（建文件夹、venv、装包）
- L2-2 第一个节点：一个普通 Python 函数就是节点
  - 关键认知：**节点 = 普通函数**，输入 state dict，返回要更新的部分
- L2-3 StateGraph + add_node + add_edge + compile + invoke
- L2-4 亲手写一个**不调模型**的图（纯函数，先搞懂机制）
  - 练习：START → double（把数字翻倍）→ END
- 验收：invoke 返回翻倍结果，能解释每一步发生了什么

### L3｜状态 State——传送带装什么（2.5 小时）
**目标**：彻底搞懂"状态"这个最难的概念。

- L3-1 TypedDict 定义状态：字段 = 传送带上的物品
- L3-2 节点返回 dict = 往传送带上放东西
- L3-3 **Reducer 机制**（关键）：
  - 普通字段：后写的**覆盖**前写的
  - `add_messages`：消息**追加**
  - 用打印观察两种行为差异
- L3-4 实战：多节点图，一个节点存数字，一个节点累加
- 验收：能解释"为什么 messages 会追加而普通字段是覆盖"——这是 LangGraph 最核心的机制

### L4｜边 Edge 与条件分支（2.5 小时）
**目标**：让图"自己决定走哪条路"。

- L4-1 直线边：START → A → B → END
- L4-2 条件边：A 跑完，根据返回值走不同分支
  - `add_conditional_edges` + 路由函数 + 映射表
- L4-3 循环边：条件不满足就绕回去（防死循环要设终止条件）
- L4-4 实战：数字奇偶分流——奇数走 A，偶数走 B
- 验收：同一个图，输入不同数字走到不同节点，能画 mermaid 说明

### L5｜接入真实模型（2 小时）
**目标**：把纯函数图升级成真·AI 对话图。

- L5-1 ChatDeepSeek 接入（读 .env 配置）
- L5-2 消息类型：HumanMessage / AIMessage / SystemMessage
  - 用 `pretty_repr()` 观察消息对象长啥样（对比 `repr()`）
  - 练习：打印 `result['messages']` 的每一层，直观看到"追加"效果
- L5-3 搭对话图：START → call_model → END
  - 系统提示词（角色设定）加在哪
- L5-4 理解 `result['messages'][-1]` 为什么是最后一条
- 验收：能对话、能按角色设定回答，能用 pretty_repr 看清消息流

### L6｜记忆 Memory——Checkpointer（2 小时）
**目标**：让图"记得之前聊过什么"。

- L6-1 问题：没有 Checkpointer 时，每次 invoke 都是全新对话
- L6-2 InMemorySaver：进程内记忆（最简单）
- L6-3 thread_id：按会话隔离记忆
  - 同一 thread_id 记得，不同 thread_id 不记得
- L6-4 MySQL Checkpointer（PyMySQLSaver）：重启也不丢
- 验收：两轮对话接得上 + 换 thread_id 隔离 + 能画记忆原理图

### L7｜工具调用 Tool Calling（3 小时）
**目标**：让 AI 能"调用函数"而不是只说话。

- L7-1 什么是工具调用：模型输出"我想调用 xxx 函数"，不是正文
- L7-2 `@tool` 装饰器定义工具
- L7-3 `bind_tools` 让模型知道有工具可用
- L7-4 三个节点：call_model（生成）→ call_tool（执行）→ 回环
  - 条件边：有 tool_calls 就调工具，没有就结束
- L7-5 ToolMessage 与 tool_call_id 配对（模型靠它认领结果）
- 验收：问"现在几点"能调 get_current_time 并正确回答

### L8｜流式输出（2 小时）
**目标**：打字机效果。

- L8-1 `graph.stream` 节点级流式（先看机制）
- L8-2 `stream_mode="messages"` + 模型 `streaming=True`（token 级）
- L8-3 接 SSE 端点（FastAPI 版），浏览器看逐字输出
- 验收：能看到逐字蹦出的回答

### L9｜Human-in-the-loop（2 小时）
**目标**：让图"停下来等人"。

- L9-1 `interrupt()` 暂停
- L9-2 `Command(resume=...)` 恢复
- L9-3 实战：审批流程（AI 生成方案 → 人类确认 → 继续/重来）
- 验收：能在关键步骤暂停等人类输入

### L10｜综合实战：把学到的串起来（3 小时）
**目标**：一个完整项目收尾。

- L10-1 设计一个多节点图：对话 + 工具 + 记忆 + 流式
- L10-2 接进现有 Django 项目（替换/新增一个接口）
- L10-3 画完整架构图 + 写口述总结

### L11｜多智能体协同（4 小时）⭐ 官方最新方向
**目标**：让多个"专业角色"分工协作。

- L11-1 核心认知：智能体 = 带记忆和工具的子图；多智能体 = 图套图
- L11-2 手搓 Supervisor 模式（理解机制）
  - 主管节点（路由）+ 多个子智能体节点 + 条件边
  - 状态在：主管维护的共享状态，记录"每个子智能体干了啥"
- L11-3 子智能体（Subgraph）：把完整图当节点用
  - 关键：子图和主图通过 State 字段通信，State 必须兼容
- L11-4 官方推荐模式：`create_deep_agent` + `SubAgent`
  - 对比手搓 Supervisor vs 官方封装，理解"为什么演进"
  - `task` 工具：主管通过工具调用把任务派给子智能体
- L11-5 三种协同模式对比：Supervisor / 层级式 / Swarm
- 验收：能搭一个"主管 + 2 个专业子智能体"的图，并说出各模式何时用

> 官方方向：`create_deep_agent`/`SubAgent` 被标为正典（canonical），
> 子智能体正在替代手搓 Supervisor。先手搓理解机制，再看官方封装。

---

## 环境准备

```bash
mkdir -p ~/Documents/python项目/learning/langgraph-lab
cd ~/Documents/python项目/learning/langgraph-lab
python3 -m venv .venv && source .venv/bin/activate
pip install langgraph langchain-deepseek python-decouple pymysql langgraph-checkpoint-mysql
```

## 建议节奏

| 天 | 内容 | 累计 |
|---|---|---|
| Day 1 | L1-L3（概念 + 最小图 + 状态） | 6h |
| Day 2 | L4-L6（条件边 + 模型 + 记忆） | 6.5h |
| Day 3 | L7-L8（工具 + 流式） | 5h |
| Day 4 | L9-L10（HIL + 综合实战） | 5h |
| Day 5 | L11（多智能体协同） | 4h |

---

## 每关通用验收法

1. 脚本跑通
2. 能画出图的 mermaid（节点/边/条件）
3. 能回答：**输入是什么、输出是什么、状态在哪里**
4. 卡住的概念要能说出"哪一步不理解"，而不是跳过
