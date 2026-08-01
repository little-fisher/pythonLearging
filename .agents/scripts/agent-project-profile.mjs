#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(getArg('project-root', process.cwd()));
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const writeMode = hasFlag('write');
const jsonMode = hasFlag('json');
const overwrite = hasFlag('overwrite');

main();

function main() {
  const profile = buildProjectProfile();

  if (writeMode) {
    writeProfile(profile);
    writeContextPackConfig(profile);
    ensureMemoryDirs();
    if (!hasFlag('no-graph')) writeProjectGraph();
  }

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
  } else {
    process.stdout.write(renderProfileMarkdown(profile));
  }
}

function buildProjectProfile() {
  const packageJson = readJsonIfExists(path.join(projectRoot, 'package.json'));
  const files = collectProjectFiles(projectRoot);
  const packageManager = detectPackageManager(files);
  const frameworks = detectFrameworks(packageJson, files);
  const commands = detectCommands(packageJson);
  const standards = detectStandards(files);
  const validation = detectValidation(files, packageJson);
  const designSources = detectDocs(files, ['figma', 'design', '设计', '视觉', 'ui', 'prototype', '原型']);
  const requirementSources = detectDocs(files, ['prd', 'requirement', 'requirements', '需求', '验收', 'spec']);
  const apiSources = detectDocs(files, ['openapi', 'swagger', 'api', 'schema', 'schemas', 'dto', 'types', 'proto', 'prisma']);
  const referenceSources = detectDocs(files, ['docs', 'readme', '参考', 'reference', 'guide', '指南']);
  const agentMemory = detectAgentMemory();

  return {
    schema_version: '1.0',
    project_root: projectRoot,
    agents_dir: agentsDir,
    generated_at: new Date().toISOString(),
    package_manager: packageManager,
    frameworks,
    commands,
    standards,
    validation,
    sources: {
      design: designSources,
      requirements: requirementSources,
      api: apiSources,
      references: referenceSources
    },
    agent_memory: agentMemory,
    recommendations: buildRecommendations({
      packageJson,
      frameworks,
      commands,
      standards,
      validation,
      designSources,
      requirementSources,
      apiSources,
      agentMemory
    })
  };
}

function collectProjectFiles(rootDir) {
  const files = [];
  walk(rootDir, files, 0);
  return files;
}

function walk(dir, files, depth) {
  if (depth > 6 || files.length > 3000) return;
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath, files, depth + 1);
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
}

function shouldSkip(name) {
  return [
    '.git',
    '.hg',
    '.svn',
    '.DS_Store',
    'node_modules',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'coverage',
    '.turbo',
    '.cache',
    '.vite',
    'tmp',
    'temp'
  ].includes(name);
}

function detectPackageManager(files) {
  const names = new Set(files.map((filePath) => path.basename(filePath)));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('package-lock.json')) return 'npm';
  if (names.has('bun.lockb') || names.has('bun.lock')) return 'bun';
  return 'unknown';
}

function detectFrameworks(packageJson, files) {
  const deps = dependencyNames(packageJson);
  const rels = new Set(files.map(relativeToProject));
  const frameworks = [];

  addIf(frameworks, deps.has('next') || rels.has('next.config.js') || rels.has('next.config.mjs'), 'Next.js');
  addIf(frameworks, deps.has('react'), 'React');
  addIf(frameworks, deps.has('vue'), 'Vue');
  addIf(frameworks, deps.has('nuxt') || rels.has('nuxt.config.ts') || rels.has('nuxt.config.js'), 'Nuxt');
  addIf(frameworks, deps.has('vite') || rels.has('vite.config.ts') || rels.has('vite.config.js'), 'Vite');
  addIf(frameworks, deps.has('@angular/core'), 'Angular');
  addIf(frameworks, deps.has('svelte'), 'Svelte');
  addIf(frameworks, deps.has('@nestjs/core'), 'NestJS');
  addIf(frameworks, deps.has('express'), 'Express');
  addIf(frameworks, deps.has('koa'), 'Koa');
  addIf(frameworks, deps.has('typescript') || rels.has('tsconfig.json'), 'TypeScript');
  addIf(frameworks, deps.has('@playwright/test') || rels.has('playwright.config.ts') || rels.has('playwright.config.js'), 'Playwright');
  addIf(frameworks, deps.has('vitest') || rels.has('vitest.config.ts'), 'Vitest');
  addIf(frameworks, deps.has('jest') || rels.has('jest.config.js') || rels.has('jest.config.ts'), 'Jest');
  addIf(frameworks, deps.has('uni-app') || deps.has('@dcloudio/uni-app'), 'uni-app');

  return frameworks.length ? frameworks : ['unknown'];
}

function detectCommands(packageJson) {
  const scripts = packageJson?.scripts || {};
  const commandMap = {};
  for (const key of ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'preview', 'e2e']) {
    if (scripts[key]) commandMap[key] = scripts[key];
  }
  return commandMap;
}

function detectStandards(files) {
  const rels = new Set(files.map(relativeToProject));
  return {
    typescript: rels.has('tsconfig.json'),
    eslint: hasAny(rels, [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      'eslint.config.js',
      'eslint.config.mjs'
    ]),
    prettier: hasAny(rels, [
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.json',
      'prettier.config.js'
    ]),
    stylelint: hasAny(rels, [
      '.stylelintrc',
      '.stylelintrc.json',
      'stylelint.config.js'
    ]),
    editorconfig: rels.has('.editorconfig')
  };
}

function detectValidation(files, packageJson) {
  const rels = new Set(files.map(relativeToProject));
  const deps = dependencyNames(packageJson);
  return {
    playwright: deps.has('@playwright/test') || hasAny(rels, ['playwright.config.ts', 'playwright.config.js']),
    cypress: deps.has('cypress') || hasAny(rels, ['cypress.config.ts', 'cypress.config.js']),
    vitest: deps.has('vitest') || hasAny(rels, ['vitest.config.ts', 'vitest.config.js']),
    jest: deps.has('jest') || hasAny(rels, ['jest.config.ts', 'jest.config.js']),
    storybook: deps.has('@storybook/react') || deps.has('@storybook/vue3') || rels.has('.storybook/main.ts'),
    openapi: files.some((filePath) => /openapi|swagger/i.test(filePath))
  };
}

function detectDocs(files, keywords) {
  const docs = [];
  for (const filePath of files) {
    const rel = relativeToProject(filePath);
    const lower = rel.toLowerCase();
    const ext = path.extname(rel).toLowerCase();
    if (!['.md', '.mdx', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;
    if (keywords.some((keyword) => lower.includes(String(keyword).toLowerCase()))) {
      docs.push(rel);
    }
  }
  return docs.slice(0, 30);
}

function detectAgentMemory() {
  const currentDir = path.join(agentsDir, 'project/memory/current');
  const monthlyDir = path.join(agentsDir, 'project/memory/monthly');
  return {
    current_exists: fs.existsSync(currentDir),
    monthly_exists: fs.existsSync(monthlyDir),
    current_files: fs.existsSync(currentDir)
      ? fs.readdirSync(currentDir).filter((name) => name !== '.DS_Store').sort()
      : []
  };
}

function buildRecommendations(input) {
  const recommendations = [];
  if (!input.commands.lint) recommendations.push('补充项目 lint 命令或在 project/charter.md 说明无 lint 的验证替代方式。');
  if (!input.commands.test && !input.validation.vitest && !input.validation.jest) recommendations.push('补充测试命令或明确本项目的最小回归方式。');
  if (!input.validation.playwright && input.frameworks.some((item) => ['React', 'Vue', 'Next.js', 'Nuxt', 'Vite'].includes(item))) {
    recommendations.push('前端项目建议补充 Playwright MCP/脚本验收入口，用于 console、network、截图证据。');
  }
  if (!input.designSources.length) recommendations.push('未识别设计规范或 Figma/截图参考；如有，请写入 project/design 或 project/requirements。');
  if (!input.requirementSources.length) recommendations.push('未识别需求/验收文档；复杂任务前应补 project/requirements 或 charter 验收边界。');
  if (!input.apiSources.length) recommendations.push('未识别 API/类型契约；涉及接口任务时应补 OpenAPI、TS types、DTO 或 schema 入口。');
  if (!input.agentMemory.current_exists) recommendations.push('初始化 .agents/project/memory/current/，让 context-pack、evidence、feedback 能落盘。');
  return recommendations;
}

function writeProfile(profile) {
  const profilePath = path.join(agentsDir, 'project/project-profile.md');
  if (fs.existsSync(profilePath) && !overwrite) {
    console.error(`project profile exists, skipped: ${profilePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, renderProfileMarkdown(profile));
  console.error(`wrote project profile: ${profilePath}`);
}

function writeContextPackConfig(profile) {
  const configPath = path.join(agentsDir, 'project/context-pack.config.json');
  if (fs.existsSync(configPath) && !overwrite) {
    console.error(`context-pack config exists, skipped: ${configPath}`);
    return;
  }

  const docs = unique([
    'project/project-profile.md',
    'project/charter.md',
    'project/task-routing-overrides.md'
  ]);

  const config = {
    schema_version: '1.0',
    generated_by: 'agent-project-profile.mjs',
    always_docs: docs,
    rules: buildContextRules(profile)
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.error(`wrote context-pack config: ${configPath}`);
}

function buildContextRules(profile) {
  const rules = [];
  if (profile.sources.design.length) {
    rules.push({
      id: 'design-sources',
      keywords: ['页面', '视觉', '设计', 'figma', '截图', '样式', 'ui'],
      docs: profile.sources.design.slice(0, 10)
    });
  }
  if (profile.sources.requirements.length) {
    rules.push({
      id: 'requirements',
      keywords: ['需求', '验收', 'prd', '规则', '流程'],
      docs: profile.sources.requirements.slice(0, 10)
    });
  }
  if (profile.sources.api.length) {
    rules.push({
      id: 'api-contracts',
      keywords: ['接口', 'api', '请求', '后端', '字段', '类型', 'schema'],
      docs: profile.sources.api.slice(0, 10)
    });
  }
  if (profile.sources.references.length) {
    rules.push({
      id: 'references',
      keywords: ['参考', '文档', '说明', '指南'],
      docs: profile.sources.references.slice(0, 10)
    });
  }
  return rules;
}

function ensureMemoryDirs() {
  for (const rel of [
    'project/memory/current',
    'project/memory/monthly',
    'project/graph',
    'project/harness/runs',
    'project/runs'
  ]) {
    fs.mkdirSync(path.join(agentsDir, rel), { recursive: true });
  }
}

function writeProjectGraph() {
  const graphScript = path.join(scriptDir, 'agent-project-graph.mjs');
  if (!fs.existsSync(graphScript)) return;
  const codegraphScript = path.join(scriptDir, 'agent-codegraph.mjs');
  const useNpx = hasFlag('use-npx') || process.env.AGENT_CODEGRAPH_USE_NPX === '1';
  const canRunCodeGraph = commandExists('codegraph') || useNpx;
  if (fs.existsSync(codegraphScript) && !hasFlag('no-codegraph') && !fs.existsSync(path.join(projectRoot, '.codegraph'))) {
    const initArgs = [
      codegraphScript,
      canRunCodeGraph ? 'init' : 'status',
      '--project-root', projectRoot,
      '--agents-dir', agentsDir,
      '--write',
      '--quiet'
    ];
    if (useNpx) initArgs.push('--use-npx');
    spawnSync(process.execPath, initArgs, {
      cwd: projectRoot,
      encoding: 'utf8'
    });
  }
  const graphArgs = [
    graphScript,
    '--project-root', projectRoot,
    '--agents-dir', agentsDir,
    '--write',
    ...(useNpx ? ['--use-npx'] : []),
    ...(hasFlag('no-codegraph') ? ['--no-codegraph'] : [])
  ];
  const result = spawnSync(process.execPath, graphArgs, {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status && result.status !== 0) {
    console.error(`project graph skipped: ${result.stderr || result.stdout || result.status}`);
  }
}

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${shellQuote(name)}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function renderProfileMarkdown(profile) {
  const lines = [];
  lines.push('# Project Profile');
  lines.push('');
  lines.push(`- generated_at: ${profile.generated_at}`);
  lines.push(`- project_root: ${profile.project_root}`);
  lines.push(`- package_manager: ${profile.package_manager}`);
  lines.push(`- frameworks: ${profile.frameworks.join(', ')}`);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  pushMap(lines, profile.commands, '未识别 package scripts。');
  lines.push('');
  lines.push('## Standards');
  lines.push('');
  pushMap(lines, profile.standards);
  lines.push('');
  lines.push('## Validation');
  lines.push('');
  pushMap(lines, profile.validation);
  lines.push('');
  lines.push('## Sources');
  lines.push('');
  pushListBlock(lines, 'Design', profile.sources.design);
  pushListBlock(lines, 'Requirements', profile.sources.requirements);
  pushListBlock(lines, 'API Contracts', profile.sources.api);
  pushListBlock(lines, 'References', profile.sources.references);
  lines.push('## Agent Memory');
  lines.push('');
  lines.push(`- current_exists: ${profile.agent_memory.current_exists}`);
  lines.push(`- monthly_exists: ${profile.agent_memory.monthly_exists}`);
  if (profile.agent_memory.current_files.length) {
    for (const file of profile.agent_memory.current_files) lines.push(`- current_file: ${file}`);
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  if (profile.recommendations.length) {
    for (const item of profile.recommendations) lines.push(`- ${item}`);
  } else {
    lines.push('- 暂无自动识别出的缺口。');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function pushMap(lines, value, emptyText = '未识别。') {
  const entries = Object.entries(value || {});
  if (!entries.length) {
    lines.push(`- ${emptyText}`);
    return;
  }
  for (const [key, item] of entries) lines.push(`- ${key}: ${item}`);
}

function pushListBlock(lines, title, items) {
  lines.push(`### ${title}`);
  lines.push('');
  if (!items.length) {
    lines.push('- 未识别。');
  } else {
    for (const item of items) lines.push(`- ${item}`);
  }
  lines.push('');
}

function dependencyNames(packageJson) {
  return new Set([
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
    ...Object.keys(packageJson?.peerDependencies || {})
  ]);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasAny(set, values) {
  return values.some((value) => set.has(value));
}

function addIf(list, condition, value) {
  if (condition && !list.includes(value)) list.push(value);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function relativeToProject(filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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
    const value = next && !next.startsWith('--') ? next : true;
    if (value !== true) index += 1;
    parsed[key] = value;
  }
  return parsed;
}

function getArg(name, fallback) {
  return args[name] === undefined ? fallback : args[name];
}

function hasFlag(name) {
  return args[name] === true;
}
