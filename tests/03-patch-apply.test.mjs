import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureTree } from './helpers/fixture-factory.mjs';
import { runPatch } from './helpers/run-python.mjs';

describe('individual patch application', () => {
  let fixture;

  beforeEach(() => { fixture = createFixtureTree(); });
  afterEach(() => { fixture.cleanup(); });

  // Data-driven test table: patches with fixture content that matches their old string
  const TESTS = [
    {
      id: 'HW-001',
      file: 'services/headless-worker-executor.js',
      sentinel: "stdio: ['ignore', 'pipe', 'pipe']",
      absent: "stdio: ['pipe', 'pipe', 'pipe']",
    },
    {
      id: 'DM-002',
      file: 'services/worker-daemon.js',
      sentinel: 'maxCpuLoad: 28.0',
      absent: 'maxCpuLoad: 2.0',
    },
    {
      id: 'SG-002',
      file: 'init/executor.js',
      sentinel: 'SG-002: Create .js/.cjs compat copies',
      absent: null, // old string is still partially present (it's a superset replacement)
    },
  ];

  for (const { id, file, sentinel, absent } of TESTS) {
    it(`${id} applies correctly`, () => {
      const r = runPatch(id, fixture.base);
      assert.equal(r.status, 0, `${id} exit code: ${r.stderr}`);

      const content = readFileSync(join(fixture.base, file), 'utf-8');
      assert.ok(content.includes(sentinel), `${id}: sentinel "${sentinel.slice(0, 40)}..." not found`);
      if (absent) {
        assert.ok(!content.includes(absent), `${id}: old string "${absent.slice(0, 40)}..." still present`);
      }
    });
  }
});
