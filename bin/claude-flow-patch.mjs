#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const COMMAND_MAP = new Map([
  ['check', 'check-patches.sh'],
  ['repair', 'repair-post-init.sh'],
]);

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

const [, , subcommand, ...args] = process.argv;

// No args or explicit --help → default to applying all patches
if (!subcommand) {
  const scriptPath = resolve(rootDir, 'patch-all.sh');
  const result = spawnSync('bash', [scriptPath], {
    stdio: 'inherit', cwd: process.cwd(), env: process.env,
  });
  process.exit(result.status ?? 1);
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
  const matches = globSync(`patch/${patchId}-*/fix.py`, { cwd: rootDir });
  if (matches.length === 0) {
    console.error(`Error: no patch found for ID "${patchId}"`);
    const ids = globSync('patch/*/fix.py', { cwd: rootDir })
      .map(p => { const d = p.split('/')[1]; const i = d.indexOf('-', d.indexOf('-') + 1); return i > 0 ? d.slice(0, i) : d; })
      .sort();
    console.error(`Available patches: ${ids.join(', ')}`);
    process.exit(1);
  }
  const fixPath = resolve(rootDir, matches[0]);
  const result = spawnSync('python3', [fixPath, ...args.slice(1)], {
    stdio: 'inherit', cwd: process.cwd(), env: process.env,
  });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  process.exit(result.status ?? 1);
}

// Named subcommands: check, repair
const scriptName = COMMAND_MAP.get(subcommand);
if (!scriptName) {
  console.error(`Unknown command: ${subcommand}`);
  usage();
  process.exit(1);
}

const scriptPath = resolve(rootDir, scriptName);
const result = spawnSync('bash', [scriptPath, ...args], {
  stdio: 'inherit', cwd: process.cwd(), env: process.env,
});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
