import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createFixtureTree } from './helpers/fixture-factory.mjs';
import { runPatch } from './helpers/run-python.mjs';

describe('functional: WM-003 auto-memory-hook generation', () => {
  let fixture;
  let content;

  beforeEach(() => {
    fixture = createFixtureTree();
    const r = runPatch('WM-003', fixture.base);
    assert.equal(r.status, 0, `WM-003 patch failed: ${r.stderr}`);
    content = readFileSync(join(fixture.base, 'init', 'helpers-generator.js'), 'utf-8');
  });

  afterEach(() => { fixture.cleanup(); });

  it('contains AutoMemoryBridge', () => {
    assert.ok(content.includes('AutoMemoryBridge'), 'AutoMemoryBridge not found in patched file');
  });

  it('contains importFromAutoMemory', () => {
    assert.ok(content.includes('importFromAutoMemory'), 'importFromAutoMemory not found in patched file');
  });

  it('contains syncToAutoMemory', () => {
    assert.ok(content.includes('syncToAutoMemory'), 'syncToAutoMemory not found in patched file');
  });

  it('does not contain stub text', () => {
    assert.ok(
      !content.includes('run init --upgrade for full support'),
      'Old stub text still present after patching',
    );
  });

  it('contains busy_timeout', () => {
    assert.ok(content.includes('busy_timeout'), 'busy_timeout not found in patched file');
  });

  it('contains hybrid-memory.db', () => {
    assert.ok(content.includes('hybrid-memory.db'), 'hybrid-memory.db not found in patched file');
  });

  it('patched helpers-generator.js is valid JavaScript', () => {
    const filePath = join(fixture.base, 'init', 'helpers-generator.js');
    const r = spawnSync('node', ['--check', filePath], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal(r.status, 0, `Syntax error: ${r.stderr}`);
  });
});

describe('functional: SG-006 wizard hook capture', () => {
  let fixture;
  let content;

  beforeEach(() => {
    fixture = createFixtureTree();
    const r = runPatch('SG-006', fixture.base);
    assert.equal(r.status, 0, `SG-006 patch failed: ${r.stderr}`);
    content = readFileSync(join(fixture.base, 'commands', 'init.js'), 'utf-8');
  });

  afterEach(() => { fixture.cleanup(); });

  it('permissionRequest hook captured', () => {
    assert.ok(
      content.includes('options.hooks.permissionRequest'),
      'permissionRequest hook assignment not found in patched init.js',
    );
  });
});

describe('functional: WM-003 session hooks', () => {
  let fixture;
  let content;

  beforeEach(() => {
    fixture = createFixtureTree();
    const r = runPatch('WM-003', fixture.base);
    assert.equal(r.status, 0, `WM-003 patch failed: ${r.stderr}`);
    content = readFileSync(join(fixture.base, 'init', 'helpers-generator.js'), 'utf-8');
  });

  afterEach(() => { fixture.cleanup(); });

  it('status shows Active (AutoMemoryBridge)', () => {
    assert.ok(
      content.includes('Active (AutoMemoryBridge)'),
      'Active (AutoMemoryBridge) status string not found in patched file',
    );
  });
});
