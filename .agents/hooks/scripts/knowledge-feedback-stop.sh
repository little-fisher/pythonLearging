#!/usr/bin/env bash
tool="${AGENT_KNOWLEDGE_TOOL:-}"
[[ -z "$tool" && -n "${CLAUDE_PROJECT_DIR:-}" ]] && tool="claude-code"
[[ -z "$tool" && -n "${CODEX_THREAD_ID:-}" ]] && tool="codex"
export AGENT_KNOWLEDGE_TOOL="${tool:-unknown}"
exec "${HOME}/.agents/knowledge-feedback/knowledge-feedback-global-stop.sh" "$@"
