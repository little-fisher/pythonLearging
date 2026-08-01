#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(getArg('project-root', process.cwd()));
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const writeMode = hasFlag('write');
const jsonMode = hasFlag('json');
const quietMode = hasFlag('quiet');
const maxFiles = Number(getArg('max-files', 4000));
const changedFiles = resolveChangedFiles();

const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.rs'
]);

const STOP_WORDS = new Set([
  'src',
  'app',
  'page',
  'pages',
  'view',
  'views',
  'component',
  'components',
  'index',
  'utils',
  'hooks',
  'api',
  'http',
  'request',
  'types',
  'type',
  'test',
  'spec',
  'style',
  'styles',
  'common',
  'shared',
  'lib',
  'core',
  'main'
]);

main();

function main() {
  if (!hasFlag('no-codegraph')) syncCodeGraphSnapshot();
  const graph = buildGraph();
  if (writeMode) writeGraph(graph);
  if (quietMode) {
    return;
  }
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(graph));
  }
}

function buildGraph() {
  const codegraph = readCodeGraphState();
  const files = collectCodeFiles(projectRoot);
  const fileSet = new Set(files.map((file) => file.rel));
  const nodes = [];
  const edges = [];
  const externalDeps = new Map();

  for (const file of files) {
    const text = safeRead(file.abs);
    const imports = extractImports(text);
    const symbols = extractSymbols(text);
    const routes = extractRoutes(text, file.rel);
    const apis = extractApis(text);
    const concepts = extractConcepts(file.rel, symbols, routes, apis);

    nodes.push({
      id: file.rel,
      path: file.rel,
      module: moduleOf(file.rel),
      kind: kindOf(file.rel),
      symbols,
      routes,
      apis,
      concepts
    });

    for (const specifier of imports) {
      const resolved = resolveImport(file.rel, specifier, fileSet);
      if (resolved) {
        edges.push({
          from: file.rel,
          to: resolved,
          type: 'imports',
          specifier
        });
      } else if (!isRelativeImport(specifier)) {
        externalDeps.set(specifier, (externalDeps.get(specifier) || 0) + 1);
      }
    }
  }

  const coupling = computeCoupling(nodes, edges);
  const modules = computeModules(nodes, edges);
  const focus = computeFocus(nodes, edges, changedFiles);

  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    project_root: projectRoot,
    agents_dir: agentsDir,
    source: {
      engine: codegraph.index_present ? 'codegraph+static-business-layer' : 'builtin-static-scan',
      codegraph_optional: false,
      codegraph_status: codegraph,
      max_files: maxFiles
    },
    stats: {
      files: nodes.length,
      edges: edges.length,
      modules: modules.length,
      external_dependencies: externalDeps.size,
      changed_files: changedFiles.length
    },
    changed_files: changedFiles,
    nodes,
    edges,
    modules,
    coupling,
    business_knowledge: buildBusinessKnowledge(nodes, modules),
    focus,
    external_dependencies: [...externalDeps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, count]) => ({ name, count })),
    recommendations: buildRecommendations({ nodes, edges, coupling, focus })
  };
}

function syncCodeGraphSnapshot() {
  const codegraphScript = path.join(scriptDir, 'agent-codegraph.mjs');
  if (!fs.existsSync(codegraphScript)) return;
  const commonArgs = [
    '--project-root', projectRoot,
    '--agents-dir', agentsDir,
    '--write',
    '--quiet'
  ];
  if (hasFlag('use-npx')) commonArgs.push('--use-npx');

  spawnSync(process.execPath, [
    codegraphScript,
    'sync',
    ...commonArgs
  ], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  const commandArgs = [
    codegraphScript,
    'snapshot',
    ...commonArgs,
    '--git-changes',
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0 && !quietMode) {
    process.stderr.write(`codegraph snapshot skipped: ${result.stderr || result.stdout || result.status}\n`);
  }
}

function readCodeGraphState() {
  const statusPath = path.join(agentsDir, 'project/graph/codegraph-status.json');
  if (!fs.existsSync(statusPath)) {
    return {
      command_available: false,
      index_present: false,
      status_path: statusPath
    };
  }
  try {
    return {
      ...JSON.parse(fs.readFileSync(statusPath, 'utf8')),
      status_path: statusPath
    };
  } catch {
    return {
      command_available: false,
      index_present: false,
      status_path: statusPath,
      parse_error: true
    };
  }
}

function collectCodeFiles(rootDir) {
  const files = [];
  walk(rootDir, files, 0);
  return files.slice(0, maxFiles);
}

function walk(dir, files, depth) {
  if (depth > 12 || files.length >= maxFiles) return;
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, files, depth + 1);
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push({
        abs,
        rel: relative(abs)
      });
    }
  }
}

function shouldSkip(name) {
  return [
    '.git',
    '.hg',
    '.svn',
    '.DS_Store',
    '.agents',
    '.codegraph',
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
    'temp',
    'logs'
  ].includes(name);
}

function extractImports(text) {
  const specs = [];
  const patterns = [
    /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specs.push(match[1]);
  }
  return [...new Set(specs)].slice(0, 80);
}

function extractSymbols(text) {
  const symbols = [];
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) symbols.push(match[1]);
  }
  return [...new Set(symbols)].slice(0, 40);
}

function extractRoutes(text, relPath) {
  const routes = new Set();
  for (const match of text.matchAll(/\bpath\s*:\s*['"]([^'"]+)['"]/g)) routes.add(match[1]);
  for (const match of text.matchAll(/\broute\s*:\s*['"]([^'"]+)['"]/g)) routes.add(match[1]);
  for (const match of text.matchAll(/(?:router\.(?:push|replace)|navigate)\(\s*['"]([^'"]+)['"]/g)) routes.add(match[1]);

  const normalized = relPath.replace(/\\/g, '/');
  const pageMatch = normalized.match(/(?:^|\/)(?:pages|views|routes)\/(.+?)\.(?:tsx?|jsx?|vue|svelte)$/);
  if (pageMatch) routes.add(`/${pageMatch[1].replace(/index$/, '').replace(/\[[^\]]+\]/g, ':param')}`);
  const appMatch = normalized.match(/(?:^|\/)app\/(.+?)\/page\.(?:tsx?|jsx?)$/);
  if (appMatch) routes.add(`/${appMatch[1].replace(/\([^)]+\)\//g, '').replace(/\[[^\]]+\]/g, ':param')}`);

  return [...routes].map((item) => item.replace(/\/+/g, '/')).slice(0, 30);
}

function extractApis(text) {
  const apis = [];
  const push = (method, url) => {
    if (!url || (!url.startsWith('/') && !url.startsWith('http'))) return;
    apis.push({ method: method.toUpperCase(), url });
  };

  for (const match of text.matchAll(/\bfetch\(\s*['"]([^'"]+)['"]/g)) push('GET', match[1]);
  for (const match of text.matchAll(/\b(?:axios|request|http|api)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi)) push(match[1], match[2]);
  for (const match of text.matchAll(/\burl\s*:\s*['"]([^'"]+)['"]/g)) push('REQUEST', match[1]);
  for (const match of text.matchAll(/\b(?:Get|Post|Put|Patch|Delete)\(\s*['"]([^'"]+)['"]/g)) push(match[0].split('(')[0], match[1]);

  return dedupeBy(apis, (item) => `${item.method} ${item.url}`).slice(0, 40);
}

function extractConcepts(relPath, symbols, routes, apis) {
  const raw = [
    ...relPath.split(/[\/._-]+/),
    ...symbols.flatMap(splitIdentifier),
    ...routes.flatMap((route) => route.split(/[\/:_-]+/)),
    ...apis.flatMap((api) => api.url.split(/[\/:_?&=-]+/))
  ];
  return [...new Set(raw.map(cleanConcept).filter(Boolean))]
    .filter((item) => !STOP_WORDS.has(item))
    .slice(0, 30);
}

function resolveImport(fromRel, specifier, fileSet) {
  if (!isRelativeImport(specifier) && !specifier.startsWith('@/')) return '';
  const fromDir = path.dirname(fromRel);
  const base = specifier.startsWith('@/')
    ? path.join('src', specifier.slice(2))
    : path.normalize(path.join(fromDir, specifier)).replaceAll(path.sep, '/');

  const candidates = [
    base,
    ...[...CODE_EXTENSIONS].map((ext) => `${base}${ext}`),
    ...[...CODE_EXTENSIONS].map((ext) => `${base}/index${ext}`)
  ].map((item) => item.replaceAll(path.sep, '/'));

  return candidates.find((candidate) => fileSet.has(candidate)) || '';
}

function computeCoupling(nodes, edges) {
  const stats = new Map(nodes.map((node) => [node.id, { file: node.id, fan_in: 0, fan_out: 0, score: 0 }]));
  for (const edge of edges) {
    if (stats.has(edge.from)) stats.get(edge.from).fan_out += 1;
    if (stats.has(edge.to)) stats.get(edge.to).fan_in += 1;
  }
  for (const stat of stats.values()) stat.score = stat.fan_in + stat.fan_out;
  return {
    top_files: [...stats.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 30),
    cycles: detectSimpleCycles(edges).slice(0, 20)
  };
}

function computeModules(nodes, edges) {
  const modules = new Map();
  for (const node of nodes) {
    const current = modules.get(node.module) || {
      id: node.module,
      files: 0,
      routes: [],
      apis: [],
      concepts: new Map(),
      fan_in: 0,
      fan_out: 0,
      imports: new Map()
    };
    current.files += 1;
    for (const route of node.routes) current.routes.push(route);
    for (const api of node.apis) current.apis.push(`${api.method} ${api.url}`);
    for (const concept of node.concepts) current.concepts.set(concept, (current.concepts.get(concept) || 0) + 1);
    modules.set(node.module, current);
  }

  const moduleByFile = new Map(nodes.map((node) => [node.id, node.module]));
  for (const edge of edges) {
    const from = moduleByFile.get(edge.from);
    const to = moduleByFile.get(edge.to);
    if (!from || !to || from === to) continue;
    modules.get(from).fan_out += 1;
    modules.get(to).fan_in += 1;
    modules.get(from).imports.set(to, (modules.get(from).imports.get(to) || 0) + 1);
  }

  return [...modules.values()]
    .map((item) => ({
      id: item.id,
      files: item.files,
      fan_in: item.fan_in,
      fan_out: item.fan_out,
      imports: [...item.imports.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([to, count]) => ({ to, count })),
      routes: [...new Set(item.routes)].slice(0, 20),
      apis: [...new Set(item.apis)].slice(0, 20),
      concepts: [...item.concepts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }))
    }))
    .sort((a, b) => (b.fan_in + b.fan_out + b.files) - (a.fan_in + a.fan_out + a.files));
}

function computeFocus(nodes, edges, changed) {
  const changedSet = new Set(changed);
  if (!changedSet.size) return { changed_files: [], impacted_files: [], impacted_modules: [] };
  const impacted = new Set(changed);
  for (const edge of edges) {
    if (changedSet.has(edge.from)) impacted.add(edge.to);
    if (changedSet.has(edge.to)) impacted.add(edge.from);
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return {
    changed_files: changed,
    impacted_files: [...impacted].filter((file) => nodeMap.has(file)).slice(0, 80),
    impacted_modules: [...new Set([...impacted].map((file) => nodeMap.get(file)?.module).filter(Boolean))]
  };
}

function buildBusinessKnowledge(nodes, modules) {
  const concepts = new Map();
  for (const node of nodes) {
    for (const concept of node.concepts) {
      const current = concepts.get(concept) || { name: concept, files: new Set(), modules: new Set(), routes: new Set(), apis: new Set() };
      current.files.add(node.id);
      current.modules.add(node.module);
      for (const route of node.routes) current.routes.add(route);
      for (const api of node.apis) current.apis.add(`${api.method} ${api.url}`);
      concepts.set(concept, current);
    }
  }
  return {
    concepts: [...concepts.values()]
      .map((item) => ({
        name: item.name,
        files: [...item.files].slice(0, 12),
        modules: [...item.modules].slice(0, 8),
        routes: [...item.routes].slice(0, 8),
        apis: [...item.apis].slice(0, 8),
        weight: item.files.size + item.modules.size
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 80),
    module_concepts: modules.slice(0, 30).map((module) => ({
      module: module.id,
      concepts: module.concepts.slice(0, 12)
    }))
  };
}

function buildRecommendations({ nodes, coupling, focus }) {
  const recommendations = [];
  if (!nodes.length) recommendations.push('未识别代码文件；请确认 project-root 是否为源码根目录。');
  if (coupling.top_files[0]?.score > 20) recommendations.push(`高耦合文件：${coupling.top_files[0].file}，修改前应做影响面分析。`);
  if (coupling.cycles.length) recommendations.push('发现简单循环依赖候选；复杂重构前应人工确认。');
  if (focus.changed_files.length && !focus.impacted_files.length) recommendations.push('存在改动文件但未进入图谱；可能是非代码文件或扫描范围不足。');
  if (!recommendations.length) recommendations.push('暂无明显结构风险；仍需按任务类型做窄验证。');
  return recommendations;
}

function detectSimpleCycles(edges) {
  const edgeSet = new Set(edges.map((edge) => `${edge.from}->${edge.to}`));
  const cycles = [];
  for (const edge of edges) {
    if (edgeSet.has(`${edge.to}->${edge.from}`) && edge.from < edge.to) cycles.push([edge.from, edge.to]);
  }
  return cycles;
}

function writeGraph(graph) {
  const graphDir = path.join(agentsDir, 'project/graph');
  fs.mkdirSync(graphDir, { recursive: true });
  fs.writeFileSync(path.join(graphDir, 'project-code-graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  fs.writeFileSync(path.join(graphDir, 'project-code-graph.md'), renderMarkdown(graph));
  fs.writeFileSync(path.join(graphDir, 'business-knowledge.md'), renderBusinessKnowledge(graph));
  if (!quietMode) process.stderr.write(`wrote project graph: ${path.join(graphDir, 'project-code-graph.md')}\n`);
}

function renderMarkdown(graph) {
  const lines = [];
  lines.push('# Project Code Graph');
  lines.push('');
  lines.push(`- generated_at: ${graph.generated_at}`);
  lines.push(`- engine: ${graph.source.engine}`);
  lines.push(`- codegraph_command_available: ${graph.source.codegraph_status.command_available}`);
  lines.push(`- codegraph_index_present: ${graph.source.codegraph_status.index_present}`);
  lines.push(`- files: ${graph.stats.files}`);
  lines.push(`- import_edges: ${graph.stats.edges}`);
  lines.push(`- modules: ${graph.stats.modules}`);
  lines.push(`- changed_files: ${graph.stats.changed_files}`);
  lines.push('');
  lines.push('## How Agents Should Use This');
  lines.push('');
  lines.push('- 定位功能时先看 Business Knowledge，再看模块和高耦合文件。');
  lines.push('- 修改前查看 changed/focus 影响面和 fan-in/fan-out。');
  lines.push('- CodeGraph MCP 可用时，优先用 codegraph_explore/search/impact 做符号级查询；本图谱沉淀业务概念和任务交接摘要。');
  lines.push('');
  lines.push('## Focus');
  lines.push('');
  if (graph.focus.changed_files.length) {
    for (const file of graph.focus.changed_files) lines.push(`- changed: ${file}`);
    for (const file of graph.focus.impacted_files.slice(0, 30)) lines.push(`- impacted: ${file}`);
  } else {
    lines.push('- no changed files detected');
  }
  lines.push('');
  lines.push('## Top Coupled Files');
  lines.push('');
  for (const item of graph.coupling.top_files.slice(0, 20)) {
    lines.push(`- ${item.file}: fan_in=${item.fan_in}, fan_out=${item.fan_out}, score=${item.score}`);
  }
  lines.push('');
  lines.push('## Modules');
  lines.push('');
  for (const module of graph.modules.slice(0, 30)) {
    lines.push(`### ${module.id}`);
    lines.push(`- files: ${module.files}`);
    lines.push(`- fan_in: ${module.fan_in}`);
    lines.push(`- fan_out: ${module.fan_out}`);
    if (module.routes.length) lines.push(`- routes: ${module.routes.slice(0, 8).join(', ')}`);
    if (module.apis.length) lines.push(`- apis: ${module.apis.slice(0, 8).join(', ')}`);
    if (module.concepts.length) lines.push(`- concepts: ${module.concepts.slice(0, 8).map((item) => item.name).join(', ')}`);
    lines.push('');
  }
  lines.push('## Recommendations');
  lines.push('');
  for (const item of graph.recommendations) lines.push(`- ${item}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderBusinessKnowledge(graph) {
  const lines = [];
  lines.push('# Business Knowledge Graph');
  lines.push('');
  lines.push('本文件是从代码路径、符号、路由和接口中抽取的业务概念索引，用于帮助 Agent 找到对应代码。');
  lines.push('');
  for (const concept of graph.business_knowledge.concepts.slice(0, 80)) {
    lines.push(`## ${concept.name}`);
    if (concept.modules.length) lines.push(`- modules: ${concept.modules.join(', ')}`);
    if (concept.routes.length) lines.push(`- routes: ${concept.routes.join(', ')}`);
    if (concept.apis.length) lines.push(`- apis: ${concept.apis.join(', ')}`);
    for (const file of concept.files.slice(0, 8)) lines.push(`- file: ${file}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function resolveChangedFiles() {
  const explicit = repeated('changed-file')
    .flatMap((item) => String(item).split(','))
    .map((item) => normalizeRel(item.trim()))
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if (!hasFlag('git-changes')) return [];

  const result = spawnSync('git', ['-C', projectRoot, 'status', '--short'], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .map((line) => line.includes(' -> ') ? line.split(' -> ').at(-1) : line)
    .map(normalizeRel)
    .filter(Boolean);
}

function isRelativeImport(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function kindOf(relPath) {
  if (/\/(?:pages|views|routes|app)\//.test(`/${relPath}`)) return 'route-or-page';
  if (/\/components?\//.test(`/${relPath}`)) return 'component';
  if (/\/(?:api|services?|requests?)\//.test(`/${relPath}`)) return 'api-client';
  if (/\/(?:store|stores|state|model|models)\//.test(`/${relPath}`)) return 'state-or-model';
  if (/\/(?:utils?|lib|shared|common)\//.test(`/${relPath}`)) return 'utility';
  return 'code';
}

function moduleOf(relPath) {
  const parts = relPath.split('/');
  const srcIndex = parts.indexOf('src');
  if (srcIndex >= 0 && parts[srcIndex + 1]) {
    const layer = parts[srcIndex + 1];
    const name = parts[srcIndex + 2] || layer;
    if (['features', 'modules', 'domains', 'pages', 'views', 'app'].includes(layer)) return `src/${layer}/${name}`;
    return `src/${layer}`;
  }
  if (parts[0] === 'packages' && parts[1]) return `packages/${parts[1]}`;
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || '.';
}

function splitIdentifier(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s._/-]+/);
}

function cleanConcept(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned)) return '';
  return cleaned.slice(0, 40);
}

function normalizeRel(value) {
  if (!value) return '';
  const absolute = path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
  return relative(absolute);
}

function relative(absPath) {
  return path.relative(projectRoot, absPath).replaceAll(path.sep, '/');
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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
    if (parsed[key] !== undefined) parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], value] : [parsed[key], value];
    else parsed[key] = value;
  }
  return parsed;
}

function getArg(name, fallback) {
  const value = args[name];
  if (Array.isArray(value)) return value.at(-1);
  return value === undefined ? fallback : value;
}

function repeated(name) {
  const value = args[name];
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}

function hasFlag(name) {
  return args[name] === true;
}
