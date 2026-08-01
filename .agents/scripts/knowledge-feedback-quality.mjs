const TELEMETRY = /(?:input_tokens|output_tokens|total_tokens|cached_input_tokens|model_context_window|rate_limits|requestId|cache_creation|temp user cleaned files cleaned|CLEANUP_DONE)/i;
const PLACEHOLDER = /^(?:继续(?:\s*[0-9a-f-]{8,})?|好的?|行|可以|ok|yes|no|# files mentioned by the user:?|未识别任务|unknown)$/i;
const AUTO_TEXT = /(?:auto-hook|auto-candidate|请由Agent|pending-review)/i;
const OUTCOME_NOISE = /(?:No response requested|hit your session limit|Prompt is too long|context window exceeded|rate limit exceeded)/i;
const KNOWLEDGE_EMPTY = /^(?:none|unknown|无|暂无|待补充|pending)$/i;
const VALIDATION_SIGNAL = /(?:pass(?:ed)?|通过|成功|完成|验证|人工确认|测试|test|lint|build|typecheck|curl|http\s*\d{3}|status\s*[=:]?\s*\d{3}|exit\s*(?:code)?\s*[=:]?\s*0|截图|日志|命令)/i;

export function normalizeTask(value, maxLength = 180) {
  return String(value ?? '')
    .replace(/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/gi, ' ')
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, ' ')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, ' ')
    .replace(/<\/?USER_REQUEST>/gi, ' ')
    .replace(/# Files mentioned by the user:?/gi, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ')
    .replace(/^用户要求[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isUsableTask(value) {
  const task = normalizeTask(value, 500);
  if (task.length < 4 || PLACEHOLDER.test(task) || TELEMETRY.test(task)) return false;
  if (/^(?:The file .+ has been updated successfully|File created successfully at:|Web search results for query:)/i.test(task)) return false;
  if (/^\[[^\]]+\s+[0-9a-f]{7,}\]\s+/i.test(task)) return false;
  if (/^(?:M|A|D|R\d*)\s+\S+/.test(task)) return false;
  if (/^\/Users\/\S+\s+(?:M|A|D|\?\?)\s+/.test(task)) return false;
  if (/"description"\s*:\s*"[^"]+".*"inputSchema"\s*:|"inputSchema"\s*:\s*\{.*"properties"\s*:/i.test(task)) return false;
  if (/^(?:={3,}|#!\/|<template|<task-notification>|interface:\s*display_name|#\s*(?:\d{4}-\d{2}-\d{2}\s+日报|一期执行计划|Evaluator Report)|>\s*Agent-generated candidates)/i.test(task)) return false;
  if (/^(?:用法:|[A-Z][A-Z0-9_]+\s*=)/.test(task) && /(?:files? changed|create mode|->|\\$)/i.test(task)) return false;
  if (/(?:\.ocr\.txt|\.清洗后\.txt|\|\s*ready\s*\||CLEANUP_DONE|[0-9a-f]{7,}\.\.[0-9a-f]{7,}\s+master\s*->)/i.test(task)) return false;
  if (/^-\s+\[[^\]]+\]\([^)]+\)/.test(task)) return false;
  if (/^(?:\{\s*["']|\[\s*(?:\{|["']))/.test(task)) return false;
  return /[A-Za-z\u4e00-\u9fff]/.test(task);
}

export function redactSensitiveText(value) {
  const original = normalizeTask(value, 2000);
  let text = original
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, '[密钥]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[密钥]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[密钥]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[密钥]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [密钥]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, 'Basic [密钥]')
    .replace(/\bhttps?:\/\/[^/\s:@]+:[^@\s/]+@/gi, 'https://[凭据]@')
    .replace(/([?&](?:token|access_token|api_key|key|secret|password)=)[^&\s]+/gi, '$1[密钥]')
    .replace(/\b(token|access_token|api[_-]?key|secret|password)\s*[:=]\s*["']?[^\s"',，；。;&}]+/gi, '$1=[密钥]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/gi, '[私钥]')
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号]')
    .replace(/\b\d{17}[\dXx]\b/g, '[身份证号]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱]')
    .replace(/\b(?:10(?:\.\d{1,3}){3}|127(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g, '[内网地址]')
    .replace(/合同编号\s*[:：]?\s*[A-Za-z0-9_-]{4,}/g, '[合同编号]')
    .replace(/[A-Za-z0-9\u4e00-\u9fff（）()·]{2,40}(?:有限责任公司|有限公司|委员会|管理中心|研究院|医院|学校)/g, '[机构]')
    .replace(/\/Users\/[^/\s]+/g, '~');

  text = text.replace(/\s+/g, ' ').trim();
  return {
    text,
    sensitive: text !== original || /(?:密码|密钥|token|secret|身份证|手机号|合同编号)/i.test(original)
  };
}

export function extractTaskFromHookInput(input = {}) {
  const keys = ['last_user_message', 'lastUserMessage', 'user_prompt', 'userPrompt', 'prompt'];
  for (const key of keys) {
    if (typeof input[key] !== 'string') continue;
    const raw = input[key];
    const task = isUsableTask(raw) ? redactSensitiveText(raw).text : '';
    return { seen: true, task };
  }
  return { seen: false, task: '' };
}

export function extractOutcomeFromHookInput(input = {}) {
  const keys = ['last_assistant_message', 'lastAssistantMessage', 'assistant_message', 'assistantMessage', 'outcome', 'response', 'output'];
  for (const key of keys) {
    if (typeof input[key] !== 'string') continue;
    return { seen: true, outcome: usableOutcome(input[key]) };
  }
  return { seen: false, outcome: '' };
}

export function extractTaskFromTranscript(text) {
  const eventMessages = [];
  const roleMessages = [];

  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record?.type === 'event_msg' && record?.payload?.type === 'user_message') {
      eventMessages.push(...textParts(record.payload.message));
      continue;
    }
    if (record?.type === 'USER_INPUT' && /^USER(?:_|$)/.test(String(record?.source || ''))) {
      const content = textParts(record.content).join('\n');
      const request = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i)?.[1] || content;
      roleMessages.push(request);
      continue;
    }
    if (record?.type === 'response_item' && record?.payload?.type === 'message' && record?.payload?.role === 'user') {
      roleMessages.push(...textParts(record.payload.content));
      continue;
    }
    if (record?.type === 'user' && record?.message?.role === 'user') {
      roleMessages.push(...textParts(record.message.content));
      continue;
    }
    if (record?.role === 'user') roleMessages.push(...textParts(record.content));
  }

  const messages = eventMessages.length ? eventMessages : roleMessages;
  if (!messages.length) return { seen: false, task: '' };
  const raw = messages.at(-1);
  return {
    seen: true,
    task: isUsableTask(raw) ? redactSensitiveText(raw).text : ''
  };
}

export function extractOutcomeFromTranscript(text) {
  const messages = [];

  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record?.type === 'response_item' && record?.payload?.type === 'message' && record?.payload?.role === 'assistant') {
      messages.push(...textParts(record.payload.content));
      continue;
    }
    if (record?.type === 'assistant' && record?.message?.role === 'assistant') {
      messages.push(...textParts(record.message.content));
      continue;
    }
    if (record?.source === 'MODEL' && record?.status === 'DONE' && ['PLANNER_RESPONSE', 'GENERIC'].includes(record?.type)) {
      messages.push(...textParts(record.content));
      continue;
    }
    if (record?.role === 'assistant') messages.push(...textParts(record.content));
  }

  if (!messages.length) return { seen: false, outcome: '' };
  return { seen: true, outcome: usableOutcome(messages.at(-1)) };
}

export function semanticTaskKey(value) {
  return normalizeTask(value, 500)
    .toLocaleLowerCase('zh-Hans-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function tasksMatch(left, right) {
  const a = semanticTaskKey(left);
  const b = semanticTaskKey(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 12 && (a.includes(b) || b.includes(a)));
}

export function effectiveKnowledgeLevel(entry = {}) {
  const requested = normalizeLevel(entry.knowledge_level);
  const sources = String(entry.useful_sources ?? '').trim().toLowerCase();
  const automatic = entry.confidence !== 'high'
    || AUTO_TEXT.test(String(entry.decisions ?? ''))
    || AUTO_TEXT.test(String(entry.reusable_output ?? ''))
    || AUTO_TEXT.test(String(entry.reusable_asset ?? ''));

  if (automatic) return !sources || sources === 'none' ? 'K0' : 'K1';
  return requested;
}

export function isVerifiedImpact(entry = {}) {
  const level = Number(effectiveKnowledgeLevel(entry).slice(1));
  return level >= 2
    && entry.confidence === 'high'
    && hasStrongValidation(entry.validation);
}

export function hasStrongValidation(value) {
  const validation = normalizeTask(value, 2000);
  return validation.length >= 8
    && !AUTO_TEXT.test(validation)
    && !KNOWLEDGE_EMPTY.test(validation)
    && VALIDATION_SIGNAL.test(validation);
}

export function isKnowledgeBearingEntry(entry = {}) {
  return [entry.reusable_output, entry.decisions, entry.reusable_asset]
    .some((value) => isSubstantiveKnowledge(value));
}

export function parseFeedbackEntries(text) {
  return String(text ?? '')
    .split(/\n(?=<!-- knowledge-feedback-id: )/)
    .filter((section) => section.includes('knowledge-feedback-id:'))
    .map((section) => {
      const heading = section.match(/^##\s+(\d{4}-\d{2}-\d{2})\s+-\s+(.+)$/m);
      return {
        id: section.match(/knowledge-feedback-id:\s*([^\s]+)/)?.[1] || '',
        date: heading?.[1] || '0000-00-00',
        task: heading?.[2] || field(section, 'task') || 'unknown',
        workflow: field(section, 'workflow') || 'unknown',
        task_type: field(section, 'task_type') || 'unknown',
        duration_minutes: field(section, 'duration_minutes') || 'unknown',
        duration_source: field(section, 'duration_source') || 'unknown',
        knowledge_level: field(section, 'knowledge_level') || 'K0',
        knowledge_used: field(section, 'knowledge_used') || 'no',
        useful_sources: field(section, 'useful_sources') || 'none',
        missing_sources: field(section, 'missing_sources') || 'none',
        decisions: field(section, 'decisions') || 'none',
        validation: field(section, 'validation') || 'none',
        reusable_asset: field(section, 'reusable_asset') || 'none',
        reusable_output: field(section, 'reusable_output') || 'none',
        suggested_destination: field(section, 'suggested_destination') || 'none',
        next_update: field(section, 'next_update') || 'none',
        confidence: field(section, 'confidence') || 'low',
        sensitive: field(section, 'sensitive') || 'yes',
        agent_tool: field(section, 'agent_tool') || 'unknown'
      };
    })
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date));
}

export function inspectFeedbackEntries(input) {
  const bestByKey = new Map();
  const knowledgeTaskKeys = new Set();
  let noiseCount = 0;
  let duplicateCount = 0;
  let sourceOrder = 0;

  for (const raw of input) {
    if (!isUsableTask(raw.task)) {
      noiseCount += 1;
      continue;
    }
    const entry = sanitizeFeedbackEntry(raw);
    entry.knowledge_level = effectiveKnowledgeLevel(entry);
    entry.source_order = sourceOrder;
    sourceOrder += 1;

    const taskKey = feedbackTaskKey(entry);
    const knowledgeKey = semanticKnowledgeKey(entry);
    if (knowledgeKey) knowledgeTaskKeys.add(taskKey);
    const key = `${taskKey}|${knowledgeKey || 'task-only'}`;
    const existing = bestByKey.get(key);
    if (!existing || entryRank(entry) >= entryRank(existing)) bestByKey.set(key, entry);
    if (existing) duplicateCount += 1;
  }

  const entries = [...bestByKey.values()].filter((entry) => {
    if (isKnowledgeBearingEntry(entry) || !knowledgeTaskKeys.has(feedbackTaskKey(entry))) return true;
    duplicateCount += 1;
    return false;
  });
  return { entries, noiseCount, duplicateCount };
}

export function sanitizeFeedbackEntry(raw = {}) {
  const entry = { ...raw };
  let sensitive = raw.sensitive === 'yes';
  for (const key of [
    'id',
    'task',
    'workflow',
    'task_type',
    'duration_minutes',
    'duration_source',
    'knowledge_used',
    'useful_sources',
    'missing_sources',
    'decisions',
    'validation',
    'reusable_asset',
    'reusable_output',
    'suggested_destination',
    'next_update',
    'confidence',
    'agent_tool',
    'project_root',
    'project_name',
    'source_path'
  ]) {
    const redacted = redactSensitiveText(raw[key]);
    entry[key] = redacted.text || String(raw[key] ?? '');
    sensitive ||= redacted.sensitive;
  }
  entry.sensitive = sensitive ? 'yes' : 'no';
  return entry;
}

function textParts(content) {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];
    if (['input_text', 'output_text', 'text'].includes(item.type) && typeof item.text === 'string') return [item.text];
    return [];
  });
}

function normalizeLevel(value) {
  const match = String(value ?? '').toUpperCase().match(/^K[0-4]$/);
  return match ? match[0] : 'K0';
}

export function feedbackEntryRank(entry) {
  const level = Number(effectiveKnowledgeLevel(entry).slice(1));
  return (entry.confidence === 'high' ? 100 : 0)
    + (hasStrongValidation(entry.validation) ? 20 : 0)
    + (isKnowledgeBearingEntry(entry) ? 10 : 0)
    + level;
}

function entryRank(entry) {
  return feedbackEntryRank(entry);
}

function usableOutcome(value) {
  const outcome = normalizeTask(value, 2000);
  if (outcome.length < 8 || OUTCOME_NOISE.test(outcome) || TELEMETRY.test(outcome)) return '';
  if (/"description"\s*:\s*"[^"]+".*"inputSchema"\s*:/i.test(outcome)) return '';
  return /[A-Za-z\u4e00-\u9fff]/.test(outcome) ? redactSensitiveText(outcome).text : '';
}

function isSubstantiveKnowledge(value) {
  const text = normalizeTask(value, 2000);
  return text.length >= 8 && !KNOWLEDGE_EMPTY.test(text) && !AUTO_TEXT.test(text) && !OUTCOME_NOISE.test(text);
}

function feedbackTaskKey(entry) {
  return `${entry.project_root || ''}|${entry.date}|${semanticTaskKey(entry.task)}`;
}

function semanticKnowledgeKey(entry) {
  const parts = [entry.reusable_output, entry.decisions, entry.reusable_asset]
    .filter(isSubstantiveKnowledge)
    .map(semanticTaskKey)
    .filter(Boolean);
  return [...new Set(parts)].sort().join('|');
}

function field(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'gm'))];
  return matches.at(-1)?.[1]?.trim() || '';
}
