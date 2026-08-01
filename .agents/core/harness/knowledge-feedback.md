# 知识回流与价值评估

本文档把知识回流落成项目可执行闭环：Agent 负责产生结果，脚本负责 Raw 落盘、脱敏、去重、Wiki 编译和统计；人工只处理敏感、冲突和 Schema / 可执行资产变更。

## 自动化边界

| 环节 | 自动化方式 | 是否需要人工 |
|---|---|---|
| 记录任务读取了哪些知识 | Agent 收尾填写 `knowledge-feedback` | 不需要 |
| 记录知识库价值等级 K0-K4 | Agent 按证据评分 | 一般不需要 |
| 写入项目 Raw Ledger | `scripts/agent-knowledge-feedback.mjs append` | 不需要 |
| 编译机器 Wiki | `scripts/agent-llm-wiki.mjs compile`；全局 bridge 自动触发 | 不需要 |
| 月度 K0-K4 统计 | `scripts/agent-knowledge-feedback.mjs summary` | 不需要 |
| 修改个人画像、全局规则、hook / skill | 独立工程任务与验收 | 需要 |

Compiler 只拥有 `个人知识管理/wiki/`。不要让它自动修改个人画像、客户相关项目事实、全局规则或可执行 Schema；这些边界不妨碍合法知识自动进入机器 Wiki。

## 项目接入

在目标项目根目录执行：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs --init
```

这会创建：

```text
.agents/project/memory/current/
  task.md
  evidence.md
  feedback-candidates.md
.agents/project/memory/monthly/
```

## Agent 收尾协议

normal / complex / long 任务结束时，Agent 必须生成两块内容：

- `Knowledge Feedback`：这次学到了什么、缺什么、建议写到哪里。
- `Knowledge Impact`：知识库对本次任务的贡献等级 K0-K4。

模板见：

- `core/templates/knowledge-feedback.md`
- `core/templates/knowledge-impact.md`

## Stop Hook 自动回流

Claude Code 可把以下 Stop hook 加到项目 `.claude/settings.json`：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .agents/hooks/scripts/knowledge-feedback-stop.sh"
          }
        ]
      }
    ]
  }
}
```

Hook 行为：

- 优先读取 `.agents/project/memory/current/context-pack.md`。
- `micro` 任务默认跳过。
- `normal` / `complex` / `long` 自动写入 `feedback-candidates.md` Raw Ledger，并尽量提取 assistant 最终结果。
- 如果缺少 context-pack，会尝试从 hook input 的 `transcript_path` 粗略判断任务复杂度。
- 全局 bridge 在 Raw 追加成功后自动编译机器 Wiki；没有可复用结果的任务只进统计，不生成伪知识。

关闭 Hook：

```bash
AGENT_KNOWLEDGE_FEEDBACK=0
```

## 写入 Raw Ledger

Agent 可以用命令直接追加：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs append \
  --task "修复地图 scale 后弹窗偏移" \
  --workflow "前端方案评审" \
  --task-type "bug-fix" \
  --knowledge-used "yes" \
  --knowledge-level K3 \
  --useful-sources "前端技术沉淀/场景专题/场景-01-大屏地图弹窗命中偏移.md" \
  --missing-sources "缺少 teleport fixed 层弹窗案例" \
  --decisions "坐标换算只保留一处" \
  --validation "hover/click/resize 人工验证通过" \
  --reusable-asset "场景补充" \
  --suggested-destination "前端技术沉淀/场景专题" \
  --confidence high \
  --sensitive no
```

也可以先生成 JSON，再写入：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs append --from-json /tmp/knowledge-feedback.json
```

## 月度统计

```bash
node .agents/scripts/agent-knowledge-feedback.mjs summary --month 2026-06
```

默认读取：

```text
.agents/project/memory/current/feedback-candidates.md
```

默认写入：

```text
.agents/project/memory/monthly/YYYY-MM-knowledge-impact.md
```

月报会汇总：

- K0-K4 分布。
- 本月命中过的知识入口。
- 本月暴露的缺失知识。
- 建议更新位置，包括机器 Wiki、前端场景专题、项目 `.agents`、模板或 skill。

## 自然语言触发词

当用户说以下任一表达时，Agent 应运行月度统计命令，而不是手写总结：

- "这个月的产出总结"
- "月度统计"
- "本月知识库价值"
- "这个月 Agent 做了什么"
- "这个月哪些知识被复用"
- "这个月缺哪些知识"

默认动作：

```bash
node .agents/scripts/agent-knowledge-feedback.mjs summary --month "$(date +%Y-%m)"
```

然后在回复中给出：

- 月报文件路径。
- K0-K4 分布。
- K2+ 数量。
- 最常命中的知识入口。
- 最需要补的缺失知识。
- 自动形成的 Wiki 单元，以及值得另行工程化的模板 / 场景 / skill。

## Agent 工具联动方式

### Claude Code

- L1：在项目 `AGENTS.md` 或 `.claude/CLAUDE.md` 中要求任务收尾运行 `agent-knowledge-feedback.mjs append`。
- L2：做一个 slash command，如 `/knowledge-feedback`，让 Agent 按模板生成 JSON 后调用脚本。
- L3：如果项目已有 Stop / SessionEnd 类 hook，统一调用全局 bridge；adapter 只负责传递生命周期，bridge 负责 Raw 与机器 Wiki 编译。

### Codex

- L1：在项目 `AGENTS.md` 中加入收尾规则，要求 normal / complex / long 任务结束时输出并运行脚本。
- L2：使用 `.codex/hooks.json` 的 `Stop` hook 调用 `hooks/scripts/knowledge-feedback-stop.sh`。
- L3：把知识回流封装成 Codex skill 或 plugin，让多个项目复用同一套 hook 和模板。

### OpenCode

- L1：在项目级 agent rules 中加入同样的收尾协议。
- L2：用 `opencode.json` 的 `instructions` 引用 `.agents/AGENTS.md`。
- L3：用 `.opencode/plugins/` 监听 `session.idle`，先节流并立即返回，再 detached 调用统一 bridge。

### Antigravity CLI

- L1：在项目规则或 skill 中引用 `.agents/AGENTS.md` 和 `core/harness/knowledge-feedback.md`。
- L2：在 Antigravity hooks 生命周期中调用 `scripts/agent-knowledge-feedback-hook.mjs`。
- L3：当多个项目稳定后，把这套 adapter 封装成可复用 skill / hook 模板。

更多细节见 `core/harness/agent-tool-adapters.md`。

## 判断原则

- Agent 可以自动收录知识，不等于结论一定正确；用 `observed / repeated / established / needs_reconcile` 表达证据状态。
- K0-K4 是趋势指标，不是财务级精确百分比。
- 真正有价值的是 K2+ 的长期比例、Wiki 命中提升、缺失知识下降和重复解释减少，而不是人工审批数量。
