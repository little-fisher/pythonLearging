# Skills 学习计划（第八期）

> 依据《第八期_Skills技能.pptx》（20 页）整理，衔接第七期 MCP 学习成果。
> 前置依赖：**MCP 阶段三（backend_django 改造）需先完成**，因为本期作业加分项要求 Skill 编排 MCP Tool，且 LangGraph v1 迁移与 MCP 改造改的是同一个 `graph.py`。
> 时间预估：概念 0.5 天 + 作业 0.5~1 天。

---

## 总体路线

```
阶段一  概念：Skill 是什么、目录规范、渐进披露、与 Prompt/MCP 的关系
阶段二  机制：LangGraph v1（create_agent + middleware），随 MCP 阶段三步骤 4 一并落地
阶段三  作业：给 backend_django 聊天项目加一个 Skills 能力包
```

---

## 阶段一 — 概念（对应 PPT 第 1~13、16 页）

**学习目标**
- 说清楚三者分工：Prompt（一次性指令）/ Skill（可复用的工作方法）/ MCP（可调用的外部能力）
- 一句话记住：**Skill 管"怎么完成任务"，MCP 管"能调用什么能力"**
- 目录规范：`SKILL.md` 必须（YAML frontmatter 的 name + description 决定能否被发现）；`scripts/` `references/` `assets/` 按需，不加空目录
- 渐进披露：Agent 先看 name/description 决定是否命中，命中后才加载完整 SKILL.md——省上下文
- description 写给"路由决策"看：写清适用场景 + 不适用边界，不堆能力清单
- 正文只放"会改变 Agent 决策"的规则：业务边界、关键顺序、输入输出格式、不可违反的约束
- 好 Skill 四原则：窄（一类任务）、清（描述可区分）、稳（规则可执行）、省（资料按需加载）

**自测问题**
- 为什么 description 里要写"不用于什么"？（提示：想想路由时的排除法）
- Skill 正文里为什么不写"数据查询规则"？（PPT 第 10 页）
- "换一个会话，Agent 仍能按同样规则完成任务"——这句话对应哪个设计目标？

---

## 阶段二 — LangGraph v1 机制（对应 PPT 第 17~19 页）

**学习目标**
- `create_react_agent`（langgraph.prebuilt）已弃用 → `create_agent`（langchain.agents）
- v1 写法差异：`system_prompt=` 参数直接传字符串，不用再手动塞 `SystemMessage`；执行循环不变
- Middleware 概念：before_model / wrap_tool_call / after_model 等节点统一插审计日志，不改变业务结果

**落地动作（与 MCP 阶段三步骤 4 合并执行）**
- 改造 `apps/chat/graph.py` 时直接使用新写法：
  `create_agent(model=..., tools=..., system_prompt=..., checkpointer=...)`
- （可选）给 agent 加一个审计 Middleware，打印工具调用的名称与参数——验收截图会更清晰

---

## 阶段三 — 作业：给 backend_django 加 Skills 能力包（对应 PPT 第 14~15、18 页）

**作业要求**：新建 Skill 目录 + SKILL.md；选一个重复任务；写清 name/description/步骤/边界；至少 2 条不同问题验证；加分项 = Skill 调用第七期 MCP Tool 拿真实数据。

### 选题（三选一，推荐第 1 个）

1. **`session-summary` 会话总结（推荐）**：用户说"总结一下这个会话/我们刚才聊了什么"时，按固定格式输出：主题、关键结论、待办事项。天然契合聊天项目，且可通过 `get_history` MCP Tool 拿真实数据（直接满足加分项）
2. `knowledge-format` 知识问答格式化：回答技术问题时按"定义→原理→例子→常见坑"固定结构输出
3. `chat-title` 会话标题生成：会话内容积累后自动总结一个准确标题（可复用现有的"未命名会话"痛点）

### 实现步骤

1. **建 Skill 目录**：`backend_django/skills/session-summary/SKILL.md`
   - frontmatter：`name: session-summary`；description 写清"做什么、何时用、不用做什么"（参考 PPT 第 6~7 页正反例）
   - 正文：处理步骤（识别总结范围 → 调 `get_history` 拿数据 → 按格式输出）、输出格式、边界（数据为空不猜测）
2. **实现渐进披露加载机制**（关键技术点，DeepSeek 无原生 Skill 支持，需手动实现）：
   - 在 `apps/chat/` 加一个 skill 加载模块：扫描 `skills/` 下所有 SKILL.md，解析 frontmatter 得到 name + description
   - agent 的 `system_prompt` 里拼接可用 skill 清单（只有 name + description，这就是"先用少量信息筛选"）
   - 注册一个 `load_skill(skill_name)` 工具：模型命中后调用它获取完整 SKILL.md 正文（这就是"命中后才加载"）
   - `load_skill` 可以直接注册在现有 `mcp_server/server.py` 里（读本地文件，无需碰 ORM），与 MCP 工具同链路
3. **改造 `graph.py`**：合并 MCP 阶段三步骤 4——`create_agent` + MCP tools（含 `load_skill`）+ checkpointer
4. **验证（作业硬指标：2 条不同问题）**：
   - 命中场景：先聊几轮，再说"总结一下我们这个会话"→ 观察模型调 `load_skill` → 再调 `get_history` → 按格式输出
   - 不命中场景：问一个无关问题（如"现在几点"）→ 模型应直接答或调 `get_current_time`，**不**加载 skill
   - 排查口诀（PPT 第 12 页）：先看 name/description 是否可区分，再看正文是否有明确的输入、步骤、输出

### 提交物清单

- Skill 目录截图 + SKILL.md 完整内容
- 两条测试问题与结果截图（命中 + 不命中各一）
- 一段说明：为什么这个 description 能被正确匹配

---

## 参考资料

- PPT：`mcp服务/第八期_Skills技能.pptx`
- 第七期成果：`backend_django/mcp_server/`（本作业的 `load_skill`、`get_history` 都挂在这里）
- MCP 计划：`mcp服务/MCP-LEARNING-PLAN.md`（阶段三步骤 3-5 待完成）
