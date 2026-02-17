// run-python.mjs — Run a patch fix.py against a fixture tree
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const COMMON_PY = resolve(ROOT, 'lib', 'common.py');
const PATCH_DIR = resolve(ROOT, 'patch');

/**
 * Run a single patch by ID against a fixture base path.
 * Replicates what patch-all.sh does: cat common.py + fix.py | python3
 */
export function runPatch(patchId, base, opts = {}) {
  const dirs = readdirSync(PATCH_DIR, { withFileTypes: true });
  const match = dirs.find(d => d.isDirectory() && d.name.startsWith(`${patchId}-`));
  if (!match) throw new Error(`No patch directory for ${patchId}`);

  const fixPath = resolve(PATCH_DIR, match.name, 'fix.py');
  const commonSrc = readFileSync(COMMON_PY, 'utf-8');
  const fixSrc = readFileSync(fixPath, 'utf-8');

  const result = spawnSync('python3', ['-'], {
    input: commonSrc + '\n' + fixSrc,
    encoding: 'utf-8',
    timeout: 10_000,
    env: {
      ...process.env,
      BASE: base,
      RUVECTOR_CLI: opts.ruvectorCli || '',
    },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

/**
 * Run raw Python code with common.py prepended and BASE set.
 */
export function runPythonCode(code, base) {
  const commonSrc = readFileSync(COMMON_PY, 'utf-8');
  const result = spawnSync('python3', ['-'], {
    input: commonSrc + '\n' + code,
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...process.env, BASE: base, RUVECTOR_CLI: '' },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}
