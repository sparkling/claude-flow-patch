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
    const match = dirs.find(d => d.isDirectory() && d.name.startsWith(`${id}-`));
    return match ? resolve(patchDir, match.name, 'fix.py') : null;
  } catch { return null; }
}

function listPatchIds() {
  try {
    return readdirSync(patchDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => { const i = d.name.indexOf('-', d.name.indexOf('-') + 1); return i > 0 ? d.name.slice(0, i) : d.name; })
      .sort();
  } catch { return []; }
}

function usage() {
  console.log(`Usage:
  claude-flow-patch                          Apply all patches (default)
  claude-flow-patch apply <ID>               Apply a single patch by defect ID (e.g. SG-002)
  claude-flow-patch check                    Verify patch sentinels are present
  claude-flow-patch repair [options]         Post-init repair

Options for default (all patches):
  --scope global|local|both                  Target scope (default: both)

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

const [, , subcommand, ...args] = process.argv;

// No args → apply all patches (most common use case)
if (!subcommand) {
  run('bash', [resolve(rootDir, 'patch-all.sh')]);
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

run('bash', [resolve(rootDir, scriptName), ...args]);
