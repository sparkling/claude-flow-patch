import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPatch, runPythonCode } from './helpers/run-python.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

describe('error handling', () => {
  it('patches skip gracefully when BASE is empty', () => {
    const r = runPatch('HW-001', '');
    assert.equal(r.status, 0);
    assert.ok(!r.stderr.includes('Error'));
  });

  it('patches skip gracefully when BASE is /dev/null', () => {
    const r = runPythonCode(`
patch("test", HWE, "old", "new")
print(f"applied={applied} skipped={skipped}")
`, '/dev/null');
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('applied=0 skipped=0'));
  });

  it('patches skip gracefully when BASE points to nonexistent directory', () => {
    const r = runPatch('HW-001', '/tmp/nonexistent-cfp-test-dir');
    assert.equal(r.status, 0);
    assert.ok(!r.stderr.includes('Traceback'));
  });

  it('patch-all.sh rejects invalid scope', () => {
    const r = spawnSync('bash', [resolve(ROOT, 'patch-all.sh'), '--scope', 'invalid'], {
      encoding: 'utf-8', timeout: 10_000,
    });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('Invalid scope') || r.stdout.includes('Invalid scope'));
  });
});
