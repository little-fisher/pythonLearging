#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'status';
const projectRoot = path.resolve(getArg('project-root', process.cwd()));
const agentsDir = path.resolve(getArg('agents-dir', path.join(projectRoot, '.agents')));
const graphDir = path.join(agentsDir, 'project/graph');
const writeMode = hasFlag('write');
const jsonMode = hasFlag('json');
const quietMode = hasFlag('quiet');

main();

function main() {
  try {
    if (command === 'help' || hasFlag('help') || hasFlag('h')) return printHelp();
    if (command === 'status') return statusCommand();
    if (command === 'install') return installCommand();
    if (command === 'init') return initCommand();
    if (command === 'sync') return syncCommand();
    if (command === 'snapshot') return snapshotCommand();
    if (command === 'explore') return exploreCommand();
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    } else {
      console.error(`agent-codegraph: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

function statusCommand() {
  const status = collectStatus({ allowNpx: hasFlag('use-npx') });
  const output = renderStatusMarkdown(status);
  if (writeMode) writeStatus(status, output);
  printOutput(status, output);
}

function installCommand() {
  const target = getArg('target', 'auto');
  const location = getArg('location', '');
  const cg = resolveCodeGraph({ allowNpx: true });
  const installArgs = ['install', '--yes'];
  if (target) installArgs.push(`--target=${target}`);
  if (location) installArgs.push(`--location=${location}`);
  const result = runCodeGraph(cg, installArgs, { cwd: projectRoot });
  const status = collectStatus({ allowNpx: hasFlag('use-npx') });
  status.last_action = {
    command: codeGraphLabel(cg, installArgs),
    exit_code: result.status ?? 0,
    stdout: trim(result.stdout),
    stderr: trim(result.stderr)
  };
  if (writeMode) writeStatus(status, renderStatusMarkdown(status));
  printOutput(status, renderStatusMarkdown(status));
}

function initCommand() {
  const cg = resolveCodeGraph({ allowNpx: hasFlag('use-npx') });
  const initArgs = ['init', projectRoot];
  const result = runCodeGraph(cg, initArgs, { cwd: projectRoot });
  const status = collectStatus({ allowNpx: hasFlag('use-npx') });
  status.last_action = {
    command: codeGraphLabel(cg, initArgs),
    exit_code: result.status ?? 0,
    stdout: trim(result.stdout),
    stderr: trim(result.stderr)
  };
  if (writeMode) {
    writeStatus(status, renderStatusMarkdown(status));
    snapshotCommand({ skipPrint: true });
  }
  printOutput(status, renderStatusMarkdown(status));
}

function syncCommand() {
  const statusBefore = collectStatus({ allowNpx: hasFlag('use-npx') });
  if (!statusBefore.index_present) {
    statusBefore.last_action = {
      command: 'codegraph sync',
      exit_code: 2,
      stderr: '.codegraph index missing; run agent-codegraph init first'
    };
    if (writeMode) writeStatus(statusBefore, renderStatusMarkdown(statusBefore));
    printOutput(statusBefore, renderStatusMarkdown(statusBefore));
    return;
  }
  const cg = resolveCodeGraph({ allowNpx: hasFlag('use-npx') });
  const syncArgs = ['sync', projectRoot];
  const result = runCodeGraph(cg, syncArgs, { cwd: projectRoot });
  const status = collectStatus({ allowNpx: hasFlag('use-npx') });
  status.last_action = {
    command: codeGraphLabel(cg, syncArgs),
    exit_code: result.status ?? 0,
    stdout: trim(result.stdout),
    stderr: trim(result.stderr)
  };
  if (writeMode) writeStatus(status, renderStatusMarkdown(status));
  printOutput(status, renderStatusMarkdown(status));
}

function snapshotCommand(options = {}) {
  const status = collectStatus({ allowNpx: hasFlag('use-npx') });
  const cg = status.command_available ? resolveCodeGraph({ allowNpx: hasFlag('use-npx') }) : null;
  const snapshot = {
    status,
    files_json: '',
    affected_text: '',
    explore_text: ''
  };

  if (cg && status.index_present) {
    const files = runCodeGraph(cg, ['files', projectRoot, '--json'], { cwd: projectRoot, allowFailure: true });
    snapshot.files_json = trim(files.stdout);

    if (hasFlag('git-changes')) {
      snapshot.affected_text = runAffected(cg);
    }

    const task = getArg('task', '');
    if (task) {
      const explore = runCodeGraph(cg, ['explore', task], { cwd: projectRoot, allowFailure: true });
      snapshot.explore_text = trim(explore.stdout || explore.stderr);
    }
  }

  if (writeMode) writeSnapshot(snapshot);
  if (!options.skipPrint) {
    printOutput(snapshot, renderSnapshotMarkdown(snapshot));
  }
}

function exploreCommand() {
  const task = getArg('task', args._.slice(1).join(' '));
  if (!task) throw new Error('--task or query text is required');
  const cg = resolveCodeGraph({ allowNpx: hasFlag('use-npx') });
  const result = runCodeGraph(cg, ['explore', task], { cwd: projectRoot });
  if (writeMode) {
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(path.join(graphDir, 'codegraph-explore.md'), result.stdout || result.stderr || '');
  }
  if (!quietMode) process.stdout.write(result.stdout || result.stderr || '');
}

function collectStatus({ allowNpx }) {
  const cg = resolveCodeGraph({ allowNpx, optional: true });
  const indexPath = path.join(projectRoot, '.codegraph');
  const status = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    project_root: projectRoot,
    agents_dir: agentsDir,
    codegraph_command: cg ? codeGraphCommandString(cg) : 'not-found',
    command_available: Boolean(cg),
    using_npx: Boolean(cg?.type === 'npx'),
    index_path: indexPath,
    index_present: fs.existsSync(indexPath),
    mcp_command: 'codegraph serve --mcp',
    status_exit_code: null,
    status_text: ''
  };

  if (cg && status.index_present) {
    const result = runCodeGraph(cg, ['status', projectRoot], { cwd: projectRoot, allowFailure: true });
    status.status_exit_code = result.status ?? 0;
    status.status_text = trim(result.stdout || result.stderr);
  }

  return status;
}

function writeStatus(status, markdown) {
  fs.mkdirSync(graphDir, { recursive: true });
  fs.writeFileSync(path.join(graphDir, 'codegraph-status.json'), `${JSON.stringify(status, null, 2)}\n`);
  fs.writeFileSync(path.join(graphDir, 'codegraph-status.md'), markdown);
}

function writeSnapshot(snapshot) {
  fs.mkdirSync(graphDir, { recursive: true });
  writeStatus(snapshot.status, renderStatusMarkdown(snapshot.status));
  if (snapshot.files_json) fs.writeFileSync(path.join(graphDir, 'codegraph-files.json'), `${snapshot.files_json}\n`);
  if (snapshot.affected_text) fs.writeFileSync(path.join(graphDir, 'codegraph-affected.txt'), `${snapshot.affected_text}\n`);
  if (snapshot.explore_text) fs.writeFileSync(path.join(graphDir, 'codegraph-explore.md'), `${snapshot.explore_text}\n`);
  fs.writeFileSync(path.join(graphDir, 'codegraph-snapshot.md'), renderSnapshotMarkdown(snapshot));
}

function renderStatusMarkdown(status) {
  const lines = [];
  lines.push('# CodeGraph Status');
  lines.push('');
  lines.push(`- generated_at: ${status.generated_at}`);
  lines.push(`- project_root: ${status.project_root}`);
  lines.push(`- command: ${status.codegraph_command}`);
  lines.push(`- command_available: ${status.command_available}`);
  lines.push(`- using_npx: ${status.using_npx}`);
  lines.push(`- index_present: ${status.index_present}`);
  lines.push(`- index_path: ${status.index_path}`);
  lines.push(`- mcp_command: ${status.mcp_command}`);
  if (status.status_exit_code !== null) lines.push(`- status_exit_code: ${status.status_exit_code}`);
  if (status.last_action) {
    lines.push('');
    lines.push('## Last Action');
    lines.push('');
    lines.push(`- command: ${status.last_action.command}`);
    lines.push(`- exit_code: ${status.last_action.exit_code}`);
    if (status.last_action.stdout) lines.push(`- stdout: ${oneLine(status.last_action.stdout)}`);
    if (status.last_action.stderr) lines.push(`- stderr: ${oneLine(status.last_action.stderr)}`);
  }
  if (status.status_text) {
    lines.push('');
    lines.push('## Raw Status');
    lines.push('');
    lines.push('```text');
    lines.push(status.status_text);
    lines.push('```');
  }
  lines.push('');
  lines.push('## Next');
  lines.push('');
  if (!status.command_available) {
    lines.push('- Install CodeGraph: `npm i -g @colbymchenry/codegraph` or run `node .agents/scripts/agent-codegraph.mjs install --use-npx --write`.');
  } else if (!status.index_present) {
    lines.push('- Initialize this project: `node .agents/scripts/agent-codegraph.mjs init --write`.');
  } else {
    lines.push('- CodeGraph is available. Agents should prefer `codegraph_explore`, `codegraph_search`, `codegraph_node`, and `codegraph_callers` for code discovery.');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderSnapshotMarkdown(snapshot) {
  const lines = [];
  lines.push('# CodeGraph Snapshot');
  lines.push('');
  lines.push(`- generated_at: ${new Date().toISOString()}`);
  lines.push(`- index_present: ${snapshot.status.index_present}`);
  lines.push(`- command_available: ${snapshot.status.command_available}`);
  lines.push('');
  if (snapshot.affected_text) {
    lines.push('## Affected Files');
    lines.push('');
    lines.push('```text');
    lines.push(snapshot.affected_text);
    lines.push('```');
    lines.push('');
  }
  if (snapshot.explore_text) {
    lines.push('## Explore');
    lines.push('');
    lines.push(snapshot.explore_text);
    lines.push('');
  }
  lines.push('## Status');
  lines.push('');
  lines.push(`- command: ${snapshot.status.codegraph_command}`);
  lines.push(`- index: ${snapshot.status.index_present ? 'present' : 'missing'}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function runAffected(cg) {
  const git = spawnSync('git', ['-C', projectRoot, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  if (git.status !== 0 || !git.stdout.trim()) return '';
  const result = runCodeGraph(cg, ['affected', '--stdin', '--quiet'], {
    cwd: projectRoot,
    input: git.stdout,
    allowFailure: true
  });
  return trim(result.stdout || result.stderr);
}

function resolveCodeGraph({ allowNpx = false, optional = false } = {}) {
  const direct = commandPath('codegraph');
  if (direct) return { type: 'binary', command: direct, prefix: [] };

  if (allowNpx || process.env.AGENT_CODEGRAPH_USE_NPX === '1') {
    const npx = commandPath('npx');
    if (npx) return { type: 'npx', command: npx, prefix: ['@colbymchenry/codegraph'] };
  }

  if (optional) return null;
  throw new Error('codegraph command not found. Install with `npm i -g @colbymchenry/codegraph`, or pass --use-npx.');
}

function runCodeGraph(cg, cgArgs, options = {}) {
  const result = spawnSync(cg.command, [...cg.prefix, ...cgArgs], {
    cwd: options.cwd || projectRoot,
    input: options.input,
    encoding: 'utf8'
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${codeGraphLabel(cg, cgArgs)} failed: ${result.stderr || result.stdout || result.status}`);
  }
  return result;
}

function commandPath(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${shellQuote(name)}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function codeGraphCommandString(cg) {
  return [cg.command, ...cg.prefix].join(' ');
}

function codeGraphLabel(cg, argsList) {
  return [codeGraphCommandString(cg), ...argsList].join(' ');
}

function printOutput(data, markdown) {
  if (quietMode) return;
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(markdown);
  }
}

function printHelp() {
  process.stdout.write(`agent-codegraph - CodeGraph integration wrapper

Usage:
  agent-codegraph status [--write] [--use-npx]
  agent-codegraph install [--target auto] [--location global|local] [--write]
  agent-codegraph init [--write] [--use-npx]
  agent-codegraph sync [--write] [--use-npx]
  agent-codegraph snapshot [--write] [--git-changes] [--task "..."] [--use-npx]
  agent-codegraph explore --task "..."

Notes:
  - CodeGraph upstream: https://github.com/colbymchenry/codegraph
  - Project init creates .codegraph/.
  - MCP server command is: codegraph serve --mcp
`);
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
  const value = args[name];
  return value === undefined || value === true ? fallback : value;
}

function hasFlag(name) {
  return args[name] === true;
}

function trim(value) {
  return String(value || '').trim().slice(0, 12000);
}

function oneLine(value) {
  return trim(value).replace(/\s+/g, ' ').slice(0, 500);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
