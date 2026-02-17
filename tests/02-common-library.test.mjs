import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPythonCode } from './helpers/run-python.mjs';

describe('common.py patch()', () => {
  let dir, base, testFile;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfp-common-'));
    base = dir;
    // patch() uses paths relative to BASE, but we'll use absolute paths in inline code
    testFile = join(dir, 'target.js');
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('applies when old string found and new string absent', () => {
    writeFileSync(testFile, "const x = 'old-value';");
    const r = runPythonCode(`
patch("test-apply", "${testFile}", "'old-value'", "'new-value'")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Applied: test-apply'));
    assert.ok(r.stdout.includes('applied=1 skipped=0'));
    assert.equal(readFileSync(testFile, 'utf-8'), "const x = 'new-value';");
  });

  it('skips when new string already present (idempotent)', () => {
    writeFileSync(testFile, "const x = 'new-value';");
    const r = runPythonCode(`
patch("test-skip", "${testFile}", "'old-value'", "'new-value'")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('applied=0 skipped=1'));
    assert.equal(readFileSync(testFile, 'utf-8'), "const x = 'new-value';");
  });

  it('warns when old string not found and new string absent', () => {
    writeFileSync(testFile, "const x = 'something-else';");
    const r = runPythonCode(`
patch("test-warn", "${testFile}", "'old-value'", "'new-value'")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('WARN'));
    assert.ok(r.stdout.includes('applied=0 skipped=0'));
    // File unchanged
    assert.equal(readFileSync(testFile, 'utf-8'), "const x = 'something-else';");
  });

  it('skips silently when file does not exist', () => {
    const r = runPythonCode(`
patch("test-missing", "${join(dir, 'nonexistent.js')}", "old", "new")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('applied=0 skipped=0'));
  });

  it('skips silently when filepath is empty', () => {
    const r = runPythonCode(`
patch("test-empty-path", "", "old", "new")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('applied=0 skipped=0'));
  });

  it('replaces only first occurrence', () => {
    writeFileSync(testFile, "aaa aaa aaa");
    const r = runPythonCode(`
patch("test-first-only", "${testFile}", "aaa", "bbb")
`, base);
    assert.equal(readFileSync(testFile, 'utf-8'), "bbb aaa aaa");
  });
});

describe('common.py patch_all()', () => {
  let dir, base, testFile;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfp-common-'));
    base = dir;
    testFile = join(dir, 'target.js');
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('replaces all occurrences', () => {
    writeFileSync(testFile, "aaa bbb aaa ccc aaa");
    const r = runPythonCode(`
patch_all("test-all", "${testFile}", "aaa", "zzz")
`, base);
    assert.equal(readFileSync(testFile, 'utf-8'), "zzz bbb zzz ccc zzz");
  });

  it('skips when new present and old absent (idempotent)', () => {
    writeFileSync(testFile, "zzz bbb zzz");
    const r = runPythonCode(`
patch_all("test-all-skip", "${testFile}", "aaa", "zzz")
print(f"applied={applied} skipped={skipped}")
`, base);
    assert.ok(r.stdout.includes('applied=0 skipped=1'));
  });

  it('re-applies when both old and new are present (partial state)', () => {
    writeFileSync(testFile, "zzz aaa zzz");
    const r = runPythonCode(`
patch_all("test-partial", "${testFile}", "aaa", "zzz")
`, base);
    assert.equal(readFileSync(testFile, 'utf-8'), "zzz zzz zzz");
  });
});

describe('common.py path resolution', () => {
  it('sets empty paths when BASE is empty', () => {
    const r = runPythonCode(`
print(f"HWE=[{HWE}] WD=[{WD}] MI=[{MI}] EXECUTOR=[{EXECUTOR}]")
`, '');
    assert.ok(r.stdout.includes('HWE=[] WD=[] MI=[] EXECUTOR=[]'));
  });

  it('resolves paths correctly from BASE', () => {
    const r = runPythonCode(`
print(f"HWE=[{HWE}]")
print(f"EXECUTOR=[{EXECUTOR}]")
`, '/fake/base');
    assert.ok(r.stdout.includes('HWE=[/fake/base/services/headless-worker-executor.js]'));
    assert.ok(r.stdout.includes('EXECUTOR=[/fake/base/init/executor.js]'));
  });
});
