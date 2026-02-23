import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureTree } from './helpers/fixture-factory.mjs';
import { runPatch } from './helpers/run-python.mjs';

describe('patch idempotency', () => {
  let fixture;

  beforeEach(() => { fixture = createFixtureTree(); });
  afterEach(() => { fixture.cleanup(); });

  const PATCHES = [
    { id: 'HW-001', file: 'services/headless-worker-executor.js' },
    { id: 'DM-002', file: 'services/worker-daemon.js' },
    { id: 'SG-003', file: 'commands/init.js' },
    { id: 'SG-003', file: 'init/executor.js' },
    { id: 'SG-003', file: 'init/helpers-generator.js' },
    { id: 'SG-001', file: 'init/settings-generator.js' },
    { id: 'SG-001', file: 'init/types.js' },
    { id: 'DM-006', file: 'services/headless-worker-executor.js' },
    { id: 'HW-004', file: 'services/worker-daemon.js' },
    { id: 'HK-004', file: 'mcp-tools/hooks-tools.js' },
    { id: 'HK-005', file: 'mcp-tools/hooks-tools.js' },
    { id: 'DM-006', file: 'commands/daemon.js' },
    { id: 'SG-004', file: 'commands/init.js' },
    { id: 'SG-005', file: 'commands/start.js' },
    { id: 'SG-006', file: 'commands/init.js' },
    { id: 'WM-001', file: 'memory/memory-initializer.js' },
    { id: 'CF-003', file: 'commands/doctor.js' },
    { id: 'WM-002', file: 'memory/intelligence.js' },
    { id: 'WM-003', file: 'init/helpers-generator.js' },
    { id: 'WM-003', file: '../../.claude/helpers/auto-memory-hook.mjs' },
    { id: 'SG-007', file: 'commands/init.js' },
    { id: 'WM-004', file: '../../.claude/helpers/auto-memory-hook.mjs' },
    // WM-005: absorbed into WM-001 (no-op, skip)
    // WM-006: absorbed into WM-002 (no-op, skip)
    { id: 'CF-004', file: 'commands/config.js' },
    // CF-005: absorbed into CF-003 (no-op, skip)
    { id: 'SG-008', file: 'init/executor.js' },
    { id: 'CF-006', file: 'commands/start.js' },
    { id: 'CF-007', file: 'commands/status.js' },
    { id: 'CF-008', file: 'commands/init.js' },
    // DOC-001: upstream README.md documentation corrections
    { id: 'DOC-001', file: '../../README.md' },
  ];

  for (const { id, file } of PATCHES) {
    it(`${id} produces identical file on second apply`, () => {
      // First apply
      const r1 = runPatch(id, fixture.base);
      assert.equal(r1.status, 0);
      const after1 = readFileSync(join(fixture.base, file), 'utf-8');

      // Second apply
      const r2 = runPatch(id, fixture.base);
      assert.equal(r2.status, 0);
      const after2 = readFileSync(join(fixture.base, file), 'utf-8');

      assert.equal(after1, after2, `${id}: file changed on second apply`);
    });

    it(`${id} reports skipped on second apply`, () => {
      runPatch(id, fixture.base);
      const r2 = runPatch(id, fixture.base);
      assert.ok(!r2.stdout.includes('Applied:'), `${id}: should not re-apply`);
    });
  }
});
