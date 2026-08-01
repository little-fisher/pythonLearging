# 通用 AI 工程化模板索引

## 入口

- [[README]]
- [[AI工程/Harness工程模板/AGENTS]]

## 通用规则

- [[AI工程/Harness工程模板/core/harness/HARNESS_CORE_SPEC]]
- [[AI工程/Harness工程模板/core/harness/README]]
- [[task-routing]]
- [[task-intake]]
- [[context-pack]]
- [[project-initialization]]
- [[project-graph]]
- [[tool-capability-matrix]]
- [[cost-budget]]
- [[experience-extraction]]
- [[AI工程/Harness工程模板/core/harness/knowledge-feedback]]
- [[agent-tool-adapters]]
- [[long-task-orchestration]]
- [[multi-agent-dispatch]]
- [[task-contract]]
- [[evaluator]]
- [[code-generation]]
- [[comments-and-fields]]
- [[eslint]]
- [[done-definition]]
- [[test-matrix]]
- [[playwright-recipes]]
- [[qa-gates]]
- [[evidence-report]]
- [[realtime-memory]]
- [[AI工程/Harness工程模板/core/tools/obsidian]]
- [[knowledge-feedback-stop.sh]]
- [[context-pack-start.sh]]
- [[agent-context-pack.mjs]]
- [[agent-codegraph.mjs]]
- [[agent-project-profile.mjs]]
- [[agent-project-graph.mjs]]
- [[harness-run.mjs]]
- [[agent-knowledge-feedback.mjs]]
- [[agent-knowledge-feedback-hook.mjs]]
- [[agent-llm-wiki.mjs]]
- [[agent-harness-verify.mjs]]
- [[agentctl.mjs]]

## 全局初始化器

- `/Users/luhonggang/.agents/bin/agent-project-init`：把本模板复制到新项目 `.agents/`，补项目根 `AGENTS.md` 短入口，并默认接入 CodeGraph、生成项目画像和代码图谱。
- `/Users/luhonggang/.agents/bin/agentctl`：发布、调度、回收、Review 和清理多 Agent 任务。
- `/Users/luhonggang/.agents/bin/agent-activity-summary`：按日 / 周 / 月聚合各项目 Agent 回流候选，生成简短任务日志。
- `/Users/luhonggang/.agents/prompt-engineering/sync-agent-prompts.mjs`：把统一提示词源同步到 Claude Code、Codex、OpenCode、Gemini / Antigravity。

## 任务模板

- [[page-build]]
- [[interaction-change]]
- [[requirement-change]]
- [[bug-fix]]
- [[regression]]
- [[asset-data-update]]

## 报告模板

- [[complex-task-breakdown]]
- [[run.json]]
- [[task-contract.json]]
- [[evaluator-report]]
- [[validation-report]]
- [[code-review-checklist]]
- [[experience-report]]
- [[AI工程/Harness工程模板/core/templates/knowledge-feedback]]
- [[knowledge-impact]]

## Hook 模板

- [[claude-settings-knowledge-feedback.json]]
- [[claude-settings-context-pack.json]]
- [[codex-hooks-knowledge-feedback.json]]
- [[opencode-knowledge-feedback-plugin.js]]
- [[antigravity-knowledge-feedback-hook]]
