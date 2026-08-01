#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const agentsDir = path.resolve(getArg('agents-dir', path.resolve(scriptDir, '..')));
const task = getTask();
const includeContent = !hasFlag('no-content');
const jsonMode = hasFlag('json');
const writeMode = hasFlag('write');
const projectConfig = readProjectConfig();
const analysis = buildContextPack();

if (writeMode) {
  const outPath = path.resolve(getArg('out', defaultOutputPath()));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderMarkdown(analysis));
  analysis.output_path = outPath;
}

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
} else {
  process.stdout.write(renderMarkdown(analysis));
}

function getTask() {
  const inlineTask = getArg('task', '');
  const taskFile = getArg('task-file', '');
  if (inlineTask) return inlineTask.trim();
  if (taskFile) return fs.readFileSync(path.resolve(taskFile), 'utf8').trim();
  return '未提供任务。请用 --task 或 --task-file 传入用户原始需求。';
}

function buildContextPack() {
  const typeMatches = matchTaskTypes(task);
  const primaryType = typeMatches[0]?.type || 'requirement-change';
  const secondaryTypes = typeMatches.slice(1, 3).map((item) => item.type);
  const size = classifySize(task, primaryType, secondaryTypes);
  const budget = resolveBudget(size);
  const projectMatches = matchProjectRules(task);
  const docs = selectDocs(primaryType, secondaryTypes, size, projectMatches, budget);
  const excerpts = includeContent ? readExcerpts(docs, budget.max_doc_chars) : [];
  const tokenEstimate = estimateTokens([
    task,
    docs.map((item) => item.path).join('\n'),
    excerpts.map((item) => item.excerpt).join('\n')
  ].join('\n'));

  return {
    schema_version: '1.0',
    task,
    task_type: {
      primary: primaryType,
      secondary: secondaryTypes
    },
    size,
    budget: {
      token_budget: budget.token_budget,
      max_docs: budget.max_docs,
      max_doc_chars: budget.max_doc_chars,
      estimated_tokens: tokenEstimate
    },
    gates: gatesForSize(size, task),
    docs,
    project_matches: projectMatches,
    missing_docs: docs.filter((item) => !item.exists).map((item) => item.path),
    excerpts,
    closeout: closeoutForSize(size)
  };
}

function matchTaskTypes(text) {
  const normalized = text.toLowerCase();
  const rules = [
    {
      type: 'bug-fix',
      keywords: ['bug', 'fix', '修复', '报错', '错误', '异常', '失败', '不生效', '残留', '错位', '崩']
    },
    {
      type: 'interaction-change',
      keywords: ['交互', '点击', '按钮', '弹窗', '状态', '切换', 'hover', '轮播', '详情', '关闭']
    },
    {
      type: 'page-build',
      keywords: ['页面', '模块', '布局', '大屏', '视觉', '组件', '新增页', '还原']
    },
    {
      type: 'asset-data-update',
      keywords: ['图片', 'svg', 'pdf', 'json', 'csv', '数据', '资源', '脚本', '生成']
    },
    {
      type: 'regression',
      keywords: ['回归', '验证', '检查', '确认没有破坏', 'review', '评审']
    },
    {
      type: 'requirement-change',
      keywords: ['需求', '修改', '调整', '改造', '规则', '工程化', '模板', '治理']
    }
  ];

  return rules
    .map((rule) => ({
      type: rule.type,
      score: rule.keywords.reduce((score, keyword) => score + (normalized.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function classifySize(text, primaryType, secondaryTypes) {
  const normalized = text.toLowerCase();
  const longHints = ['长期', '多轮', '分阶段', '路线图', '多 agent', '多agent', '接手', '编排', '三个月', '3 个月', '90 天'];
  const complexHints = ['跨模块', '跨状态', '跨路由', '跨工具', '公开接口', '地图', 'canvas', '数据生成', '工程化', '治理', '自动', '全都加上', 'figma', '设计规范', '截图比对', '接口', 'network', '状态码', '后端'];
  const microHints = ['文案', '改字', '错别字', '格式', '单文件', '说明'];

  if (longHints.some((hint) => normalized.includes(hint.toLowerCase()))) return 'long';
  if (complexHints.some((hint) => normalized.includes(hint.toLowerCase()))) return 'complex';
  if (secondaryTypes.length >= 2) return 'complex';
  if (primaryType === 'regression' && normalized.length > 120) return 'complex';
  if (normalized.length < 80 && microHints.some((hint) => normalized.includes(hint.toLowerCase()))) return 'micro';
  return 'normal';
}

function selectDocs(primaryType, secondaryTypes, size, projectMatches, budget) {
  const candidates = [];
  addDoc(candidates, 'AGENTS.md', 'entry', true);
  addDoc(candidates, 'core/harness/task-intake.md', 'entry', true);
  addDoc(candidates, 'core/harness/context-pack.md', 'entry', true);
  addDoc(candidates, 'core/harness/task-routing.md', 'routing', true);
  addDoc(candidates, taskDoc(primaryType), 'task-type', true);

  if (exists('project/charter.md')) addDoc(candidates, 'project/charter.md', 'project-base', true);
  if (exists('project/project-profile.md')) addDoc(candidates, 'project/project-profile.md', 'project-base', true);
  if (exists('project/graph/project-code-graph.md')) addDoc(candidates, 'project/graph/project-code-graph.md', 'project-graph', false);
  if (exists('project/graph/business-knowledge.md')) addDoc(candidates, 'project/graph/business-knowledge.md', 'project-graph', false);
  if (exists('project/task-routing-overrides.md')) addDoc(candidates, 'project/task-routing-overrides.md', 'project-base', true);
  if (requiresToolMatrix(task) || requiresLiveDocs(task)) addDoc(candidates, 'core/harness/tool-capability-matrix.md', 'tool-capability', false);

  for (const doc of arrayOf(projectConfig.always_docs)) addDoc(candidates, doc, 'project-config', false);
  for (const match of projectMatches) {
    for (const doc of arrayOf(match.docs)) addDoc(candidates, doc, `project-rule:${match.id}`, false);
  }
  for (const type of secondaryTypes) addDoc(candidates, taskDoc(type), 'secondary-type', false);

  addDoc(candidates, 'core/harness/cost-budget.md', 'budget', false);
  if (size === 'complex' || size === 'long') {
    addDoc(candidates, 'core/harness/task-contract.md', 'complex-gate', true);
    addDoc(candidates, 'core/harness/project-graph.md', 'complex-gate', false);
    addDoc(candidates, 'core/validation/qa-gates.md', 'complex-gate', true);
    addDoc(candidates, 'core/memory/realtime-memory.md', 'complex-gate', false);
    addDoc(candidates, 'core/harness/evaluator.md', 'complex-gate', true);
    addDoc(candidates, 'core/harness/experience-extraction.md', 'complex-gate', false);
  }
  if (size === 'long') addDoc(candidates, 'core/harness/long-task-orchestration.md', 'long-gate', true);

  const deduped = dedupeDocs(candidates);
  const required = deduped.filter((item) => item.required);
  const optional = deduped.filter((item) => !item.required);
  return [...required, ...optional].slice(0, Math.max(required.length, budget.max_docs));
}

function taskDoc(type) {
  const map = {
    'page-build': 'core/harness/tasks/page-build.md',
    'interaction-change': 'core/harness/tasks/interaction-change.md',
    'requirement-change': 'core/harness/tasks/requirement-change.md',
    'bug-fix': 'core/harness/tasks/bug-fix.md',
    regression: 'core/harness/tasks/regression.md',
    'asset-data-update': 'core/harness/tasks/asset-data-update.md'
  };
  return map[type] || map['requirement-change'];
}

function requiresToolMatrix(text) {
  const normalized = text.toLowerCase();
  return [
    'skill',
    'skills',
    'mcp',
    '工具',
    '能力矩阵',
    'codebase memory',
    'codegraph',
    'playwright',
    'taskmaster',
    'firecrawl',
    'context7',
    '实时文档'
  ].some((hint) => normalized.includes(hint.toLowerCase()));
}

function requiresLiveDocs(text) {
  const normalized = text.toLowerCase();
  return [
    '官方文档',
    '实时文档',
    'context7',
    'openai',
    'codex',
    'chatgpt',
    'sdk',
    'api',
    '版本',
    '升级',
    '迁移',
    'breaking change',
    '依赖',
    '框架',
    '库',
    'plugin',
    '插件'
  ].some((hint) => normalized.includes(hint.toLowerCase()));
}

function matchProjectRules(text) {
  const rules = arrayOf(projectConfig.rules);
  const normalized = text.toLowerCase();
  return rules
    .map((rule) => {
      const keywords = arrayOf(rule.keywords);
      const hits = keywords.filter((keyword) => normalized.includes(String(keyword).toLowerCase()));
      return {
        id: rule.id || 'unnamed',
        reason: hits.join(', '),
        docs: arrayOf(rule.docs),
        anchors: arrayOf(rule.anchors)
      };
    })
    .filter((item) => item.reason);
}

function readExcerpts(docs, maxDocChars) {
  return docs
    .filter((doc) => doc.exists)
    .map((doc) => {
      const text = fs.readFileSync(resolveInAgents(doc.path), 'utf8').trim();
      return {
        path: doc.path,
        tokens: estimateTokens(text),
        excerpt: truncate(text, maxDocChars)
      };
    });
}

function renderMarkdown(pack) {
  const lines = [];
  lines.push('# Agent Context Pack');
  lines.push('');
  lines.push('## Task');
  lines.push('');
  lines.push(pack.task);
  lines.push('');
  lines.push('## Routing');
  lines.push('');
  lines.push(`- primary_type: ${pack.task_type.primary}`);
  lines.push(`- secondary_types: ${pack.task_type.secondary.length ? pack.task_type.secondary.join(', ') : 'none'}`);
  lines.push(`- size: ${pack.size}`);
  lines.push(`- token_budget: ${pack.budget.token_budget}`);
  lines.push(`- estimated_tokens: ${pack.budget.estimated_tokens}`);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  for (const gate of pack.gates) lines.push(`- ${gate}`);
  lines.push('');
  lines.push('## Read Order');
  lines.push('');
  for (const doc of pack.docs) {
    const status = doc.exists ? 'ok' : 'missing';
    lines.push(`- [${status}] ${doc.path} (${doc.reason})`);
  }
  if (pack.project_matches.length) {
    lines.push('');
    lines.push('## Project Matches');
    lines.push('');
    for (const match of pack.project_matches) lines.push(`- ${match.id}: ${match.reason}`);
  }
  if (pack.missing_docs.length) {
    lines.push('');
    lines.push('## Missing Docs');
    lines.push('');
    for (const doc of pack.missing_docs) lines.push(`- ${doc}`);
  }
  if (pack.excerpts.length) {
    lines.push('');
    lines.push('## Excerpts');
    for (const item of pack.excerpts) {
      lines.push('');
      lines.push(`### ${item.path}`);
      lines.push('');
      lines.push('```text');
      lines.push(item.excerpt);
      lines.push('```');
    }
  }
  lines.push('');
  lines.push('## Closeout');
  lines.push('');
  for (const item of pack.closeout) lines.push(`- ${item}`);
  lines.push('');
  if (pack.output_path) lines.push(`output_path: ${pack.output_path}`);
  return `${lines.join('\n')}\n`;
}

function gatesForSize(size, text = '') {
  const gates = {
    micro: ['不建契约', '不写 memory', '只做最窄验证'],
    normal: ['生成上下文包', '明确范围和验证方式', '失败或扩范围时升级到 complex'],
    complex: ['创建或更新任务契约', '同步 current memory', '按契约启用 Evaluator'],
    long: ['拆分阶段', '为每阶段生成上下文包', '维护 runs 交接记录', '阶段结束运行 Evaluator']
  };
  const selected = [...(gates[size] || gates.normal)];
  if (requiresLiveDocs(text)) selected.push('命中第三方库/API/版本时验证实时官方文档');
  return selected;
}

function closeoutForSize(size) {
  if (size === 'micro') return ['最终回复说明已验证和未验证项'];
  if (size === 'normal') return ['最终回复说明上下文判断、验证证据和剩余风险'];
  if (size === 'complex') return ['压缩 current memory', '按需填写 experience-report', '最终回复说明 Evaluator 结论'];
  return ['写阶段交接', '压缩当前上下文', '抽取可复用经验', '明确下一阶段停止条件'];
}

function resolveBudget(size) {
  const defaults = {
    micro: { token_budget: 3000, max_docs: 4, max_doc_chars: 1200 },
    normal: { token_budget: 8000, max_docs: 8, max_doc_chars: 2200 },
    complex: { token_budget: 16000, max_docs: 12, max_doc_chars: 3000 },
    long: { token_budget: 24000, max_docs: 14, max_doc_chars: 2600 }
  };
  const override = projectConfig.budgets?.[size] || {};
  const cliMaxDocChars = Number(getArg('max-doc-chars', 0));
  return {
    ...defaults[size],
    ...override,
    max_doc_chars: cliMaxDocChars || override.max_doc_chars || defaults[size].max_doc_chars
  };
}

function addDoc(list, relPath, reason, required) {
  if (!relPath) return;
  list.push({
    path: normalizeRelPath(relPath),
    reason,
    required: Boolean(required),
    exists: exists(relPath)
  });
}

function dedupeDocs(docs) {
  const seen = new Map();
  for (const doc of docs) {
    const key = doc.path;
    if (!seen.has(key)) {
      seen.set(key, doc);
    } else if (doc.required) {
      seen.set(key, { ...seen.get(key), required: true, reason: `${seen.get(key).reason},${doc.reason}` });
    }
  }
  return [...seen.values()];
}

function readProjectConfig() {
  const configPath = resolveInAgents('project/context-pack.config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    return {
      rules: [],
      config_error: error.message
    };
  }
}

function defaultOutputPath() {
  if (exists('project/memory/current')) return resolveInAgents('project/memory/current/context-pack.md');
  return path.resolve(agentsDir, 'context-pack.md');
}

function exists(relPath) {
  return fs.existsSync(resolveInAgents(relPath));
}

function resolveInAgents(relPath) {
  return path.resolve(agentsDir, normalizeRelPath(relPath));
}

function normalizeRelPath(value) {
  return String(value).replace(/^\.agents\//, '').replace(/^\.\//, '');
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n...`;
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (!item.startsWith('--')) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function getArg(name, fallback) {
  return args[name] === undefined ? fallback : args[name];
}

function hasFlag(name) {
  return args[name] === true;
}
