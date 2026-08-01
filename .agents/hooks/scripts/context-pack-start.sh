#!/usr/bin/env bash
set -euo pipefail

# UserPromptSubmit hook: 任务开始时自动生成上下文包。
# - micro 任务静默跳过,不为琐碎 prompt churn 文件或污染上下文。
# - 非 micro 任务写入 .agents/project/memory/current/context-pack.md,并只回一行摘要。
# - 设 AGENT_CONTEXT_PACK=0 可关闭。永不阻断 prompt。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${AGENT_CONTEXT_PACK:-1}" == "0" ]]; then
  cat >/dev/null || true
  exit 0
fi

input_file="$(mktemp "${TMPDIR:-/tmp}/context-pack-hook-input.XXXXXX")"
trap 'rm -f "$input_file"' EXIT
cat >"$input_file" || true

# 从 UserPromptSubmit 的 JSON 输入中取出 prompt 文本。
prompt="$(node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const o = JSON.parse(s);
      process.stdout.write(String(o.prompt || o.user_prompt || ""));
    } catch {
      process.stdout.write("");
    }
  });
' <"$input_file" 2>/dev/null || true)"

if [[ -z "${prompt// /}" ]]; then
  exit 0
fi

prompt_file="$(mktemp "${TMPDIR:-/tmp}/context-pack-prompt.XXXXXX")"
trap 'rm -f "$input_file" "$prompt_file"' EXIT
printf '%s' "$prompt" >"$prompt_file"

# 先分级:micro 直接跳过,避免对六成小任务增负。
size="$(node "$ROOT_DIR/scripts/agent-context-pack.mjs" --task-file "$prompt_file" --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).size||""))}catch{process.stdout.write("")}})' 2>/dev/null || true)"

if [[ "$size" == "micro" || -z "$size" ]]; then
  exit 0
fi

# 非 micro:写入上下文包,只回一行摘要(不把全文注入上下文)。
primary="$(node "$ROOT_DIR/scripts/agent-context-pack.mjs" --task-file "$prompt_file" --write --no-content --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String(o.task_type?.primary||""))}catch{process.stdout.write("")}})' 2>/dev/null || true)"

echo "[context-pack] size=${size} primary=${primary:-unknown} -> .agents/project/memory/current/context-pack.md"
