import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
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

  it('patch-all.sh rejects unknown options', () => {
    const r = spawnSync('bash', [resolve(ROOT, 'patch-all.sh'), '--bogus'], {
      encoding: 'utf-8', timeout: 10_000,
    });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('Unknown option') || r.stdout.includes('Unknown option'));
  });
});

describe('--global and --target flags', () => {
  const PATCH_ALL = resolve(ROOT, 'patch-all.sh');
  let tmp;

  function run(...args) {
    return spawnSync('bash', [PATCH_ALL, ...args], {
      encoding: 'utf-8', timeout: 30_000,
    });
  }

  it('setup: create temp dir', () => {
    tmp = mkdtempSync(join(tmpdir(), 'cfp-target-test-'));
  });

  it('no flags defaults to --global (exits 0)', () => {
    const r = run();
    assert.equal(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes('Targets: global'), 'should report global target');
  });

  it('--global exits 0 and reports global target', () => {
    const r = run('--global');
    assert.equal(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes('Targets: global'), 'should report global target');
  });

  it('--target with valid empty dir exits 0 and reports not found', () => {
    const r = run('--target', tmp);
    assert.equal(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes(tmp), 'should show target dir');
    assert.ok(out.includes('not found'), 'should report package not found in target');
    // should NOT include "Targets: global"
    assert.ok(!out.includes('Targets: global'), 'should not include global');
  });

  it('--global --target together exits 0 and reports both', () => {
    const r = run('--global', '--target', tmp);
    assert.equal(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes('global'), 'should report global');
    assert.ok(out.includes(tmp), 'should report target dir');
  });

  it('--target with nonexistent dir exits 1', () => {
    const r = run('--target', '/tmp/nonexistent-cfp-target-test');
    assert.equal(r.status, 1);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes('does not exist'), 'should report dir does not exist');
  });

  it('--target without argument exits 1', () => {
    const r = run('--target');
    assert.equal(r.status, 1);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes('requires a directory'), 'should report missing argument');
  });

  it('--help shows --global and --target', () => {
    const r = run('--help');
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('--global'));
    assert.ok(r.stdout.includes('--target'));
  });

  it('cleanup: remove temp dir', () => {
    rmSync(tmp, { recursive: true });
  });
});

describe('PATCH_INCLUDE / PATCH_EXCLUDE filtering', () => {
  // Test the filtering logic in isolation using a temp directory with
  // fake patch dirs and a minimal bash script that mimics patch-all.sh's loop.
  let tmp;

  const FILTER_SCRIPT = `
    PATCH_DIR="$1"
    for fix in "$PATCH_DIR"/*/fix.py; do
      [ -f "$fix" ] || continue
      dirname=$(basename "$(dirname "$fix")")
      if [ -n "\${PATCH_INCLUDE:-}" ] && ! echo "$dirname" | grep -qE "$PATCH_INCLUDE"; then
        continue
      fi
      if [ -n "\${PATCH_EXCLUDE:-}" ] && echo "$dirname" | grep -qE "$PATCH_EXCLUDE"; then
        continue
      fi
      echo "$dirname"
    done
  `;

  function runFilter(patchDir, env = {}) {
    const r = spawnSync('bash', ['-c', FILTER_SCRIPT, '--', patchDir], {
      encoding: 'utf-8', timeout: 5_000,
      env: { ...process.env, ...env },
    });
    return (r.stdout || '').trim().split('\n').filter(Boolean);
  }

  // Create a temp patch tree with known directories
  const fakeDirs = [
    'CF-001-doctor-yaml',
    'DM-001-daemon-log-zero',
    'DM-002-cpu-load-threshold',
    'HW-001-stdin-hang',
    'HW-002-failures-swallowed',
    'RV-001-force-learn-tick',
  ];

  it('setup: create temp patch dirs', () => {
    tmp = mkdtempSync(join(tmpdir(), 'cfp-filter-test-'));
    for (const dir of fakeDirs) {
      mkdirSync(join(tmp, dir));
      writeFileSync(join(tmp, dir, 'fix.py'), '# stub');
    }
  });

  it('no filter returns all patches', () => {
    const result = runFilter(tmp);
    assert.deepEqual(result, fakeDirs);
  });

  it('PATCH_INCLUDE with prefix matches subset', () => {
    const result = runFilter(tmp, { PATCH_INCLUDE: '^DM-' });
    assert.deepEqual(result, ['DM-001-daemon-log-zero', 'DM-002-cpu-load-threshold']);
  });

  it('PATCH_INCLUDE with alternation matches specific IDs', () => {
    const result = runFilter(tmp, { PATCH_INCLUDE: 'DM-001|HW-002' });
    assert.deepEqual(result, ['DM-001-daemon-log-zero', 'HW-002-failures-swallowed']);
  });

  it('PATCH_INCLUDE with substring matches across prefixes', () => {
    const result = runFilter(tmp, { PATCH_INCLUDE: 'daemon|stdin' });
    assert.deepEqual(result, ['DM-001-daemon-log-zero', 'HW-001-stdin-hang']);
  });

  it('PATCH_EXCLUDE removes matching patches', () => {
    const result = runFilter(tmp, { PATCH_EXCLUDE: '^RV-' });
    assert.deepEqual(result, fakeDirs.filter(d => !d.startsWith('RV-')));
  });

  it('PATCH_EXCLUDE with alternation removes multiple prefixes', () => {
    const result = runFilter(tmp, { PATCH_EXCLUDE: '^(DM|RV)-' });
    assert.deepEqual(result, ['CF-001-doctor-yaml', 'HW-001-stdin-hang', 'HW-002-failures-swallowed']);
  });

  it('PATCH_INCLUDE and PATCH_EXCLUDE combine (include first, then exclude)', () => {
    const result = runFilter(tmp, { PATCH_INCLUDE: '^(DM|HW)-', PATCH_EXCLUDE: 'HW-002' });
    assert.deepEqual(result, ['DM-001-daemon-log-zero', 'DM-002-cpu-load-threshold', 'HW-001-stdin-hang']);
  });

  it('PATCH_INCLUDE with no matches returns empty', () => {
    const result = runFilter(tmp, { PATCH_INCLUDE: '^ZZ-NOMATCH' });
    assert.deepEqual(result, []);
  });

  it('cleanup: remove temp dirs', () => {
    rmSync(tmp, { recursive: true });
  });
});
