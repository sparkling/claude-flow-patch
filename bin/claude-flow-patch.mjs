#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const COMMAND_MAP = new Map([
  ['patch', 'patch-all.sh'],
  ['patch-all', 'patch-all.sh'],
  ['check', 'check-patches.sh'],
  ['check-patches', 'check-patches.sh'],
  ['repair', 'repair-post-init.sh'],
  ['repair-post-init', 'repair-post-init.sh'],
]);

function usage() {
  console.log(`Usage:
  claude-flow-patch patch [--scope global|local|both]
  claude-flow-patch check
  claude-flow-patch repair [--target <dir>] [--source auto|local|global] [--dry-run]

Aliases:
  patch-all, check-patches, repair-post-init
`);
}

const [, , subcommand, ...args] = process.argv;

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  usage();
  process.exit(subcommand ? 0 : 1);
}

const scriptName = COMMAND_MAP.get(subcommand);
if (!scriptName) {
  console.error(`Unknown command: ${subcommand}`);
  usage();
  process.exit(1);
}

const scriptPath = resolve(rootDir, scriptName);
const result = spawnSync('bash', [scriptPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
