// run-cli.mjs — Wrapper for invoking bin/claude-flow-patch.mjs
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '..', '..', 'bin', 'claude-flow-patch.mjs');

export function runCli(...args) {
  const result = spawnSync('node', [BIN, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}
