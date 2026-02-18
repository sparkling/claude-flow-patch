#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const patchDir = resolve(rootDir, 'patch');

const COMMAND_MAP = new Map([
  ['check', 'check-patches.sh'],
  ['repair', 'repair-post-init.sh'],
]);

function findPatch(id) {
  try {
    const dirs = readdirSync(patchDir, { withFileTypes: true });
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^(\\d+-)?${escaped}-`);
    const match = dirs.find(d => d.isDirectory() && re.test(d.name));
    return match ? resolve(patchDir, match.name, 'fix.py') : null;
  } catch { return null; }
}

function listPatchIds() {
  try {
    return readdirSync(patchDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const name = d.name.replace(/^\d+-/, '');
        const i = name.indexOf('-', name.indexOf('-') + 1);
        return i > 0 ? name.slice(0, i) : name;
      })
      .sort();
  } catch { return []; }
}

function usage() {
  console.log(`Usage:
  claude-flow-patch                          Apply all patches (default)
  claude-flow-patch apply <ID>               Apply a single patch by defect ID (e.g. SG-002)
  claude-flow-patch check                    Verify patch sentinels are present
  claude-flow-patch repair [options]         Post-init repair

Options for default (all patches) and check:
  --include <regex>                          Only patches matching regex (against dir name)
  --exclude <regex>                          Skip patches matching regex (against dir name)
  --scope global|local|both                  Target scope (default: both)

  Examples:
    claude-flow-patch --include "^DM-"       Only daemon patches
    claude-flow-patch --exclude "^RV-"       Skip ruvector patches
    claude-flow-patch --include "DM-001|HW-002"  Specific patches by ID

Options for repair:
  --target <dir>                             Target directory
  --source auto|local|global                 Source scope
  --dry-run                                  Show what would happen
`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: process.cwd(), env: process.env, ...opts });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  process.exit(result.status ?? 1);
}

// ── Parse --include / --exclude from anywhere in argv ──

function extractOpt(argv, name) {
  const idx = argv.indexOf(name);
  if (idx < 0 || idx + 1 >= argv.length) return null;
  const val = argv[idx + 1];
  argv.splice(idx, 2);
  return val;
}

const rawArgs = process.argv.slice(2);
const includeRe = extractOpt(rawArgs, '--include');
const excludeRe = extractOpt(rawArgs, '--exclude');

const [subcommand, ...args] = rawArgs;

// Pass filter regexes to patch-all.sh / check-patches.sh via env
function filterEnv() {
  const env = { ...process.env };
  if (includeRe) env.PATCH_INCLUDE = includeRe;
  if (excludeRe) env.PATCH_EXCLUDE = excludeRe;
  return env;
}

// No args → apply all patches (most common use case)
if (!subcommand) {
  run('bash', [resolve(rootDir, 'patch-all.sh')], { env: filterEnv() });
}

if (subcommand === '--help' || subcommand === '-h') {
  usage();
  process.exit(0);
}

// apply <ID> — run a single patch
if (subcommand === 'apply') {
  const patchId = args[0];
  if (!patchId) {
    console.error('Error: apply requires a patch ID (e.g. claude-flow-patch apply SG-002)');
    process.exit(1);
  }
  const fixPath = findPatch(patchId);
  if (!fixPath) {
    console.error(`Error: no patch found for ID "${patchId}"`);
    console.error(`Available patches: ${listPatchIds().join(', ')}`);
    process.exit(1);
  }
  run('python3', [fixPath, ...args.slice(1)]);
}

// Named subcommands: check, repair
const scriptName = COMMAND_MAP.get(subcommand);
if (!scriptName) {
  console.error(`Unknown command: ${subcommand}`);
  usage();
  process.exit(1);
}

run('bash', [resolve(rootDir, scriptName), ...args], { env: filterEnv() });
