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
      id: 'SG-003',
      file: 'commands/init.js',
      sentinel: 'SG-003',
      absent: null,
    },
    {
      id: 'SG-003',
      file: 'init/executor.js',
      sentinel: 'SG-003',
      absent: null,
    },
    {
      id: 'SG-003',
      file: 'init/helpers-generator.js',
      sentinel: "router.cjs",
      absent: "router.js",
    },
    {
      id: 'SG-001',
      file: 'init/settings-generator.js',
      sentinel: 'components.statusline && options.statusline.enabled',
      absent: null,
    },
    {
      id: 'SG-001',
      file: 'init/types.js',
      sentinel: 'SG-001',
      absent: null,
    },
    {
      id: 'DM-006',
      file: 'services/headless-worker-executor.js',
      sentinel: 'cleanupOldLogs',
      absent: null,
    },
    {
      id: 'HW-004',
      file: 'services/worker-daemon.js',
      sentinel: '16 * 60 * 1000',
      absent: 'DEFAULT_WORKER_TIMEOUT_MS = 5 * 60 * 1000',
    },
    {
      id: 'HW-003',
      file: 'services/worker-daemon.js',
      sentinel: 'parseInterval',
      absent: null,
    },
    {
      id: 'HK-004',
      file: 'mcp-tools/hooks-tools.js',
      sentinel: 'claudeFlow?.daemon?.autoStart',
      absent: null,
    },
    {
      id: 'HK-005',
      file: 'mcp-tools/hooks-tools.js',
      sentinel: 'HK-005: PID-file guard',
      absent: null,
    },
    {
      id: 'DM-006',
      file: 'commands/daemon.js',
      sentinel: 'Rotate main daemon.log',
      absent: null,
    },
    {
      id: 'SG-004',
      file: 'commands/init.js',
      sentinel: 'SG-004',
      absent: null,
    },
    {
      id: 'SG-005',
      file: 'commands/start.js',
      sentinel: 'allCommand',
      absent: null,
    },
    {
      id: 'SG-006',
      file: 'commands/init.js',
      sentinel: 'options.hooks.permissionRequest',
      absent: null,
    },
    {
      id: 'SG-006',
      file: 'commands/init.js',
      sentinel: 'options.runtime.topology ||',
      absent: "init --topology hierarchical 2>",
    },
    {
      id: 'WM-001',
      file: 'memory/memory-initializer.js',
      sentinel: 'HybridBackend',
      absent: null,
    },
    {
      id: 'WM-001',
      file: 'memory/memory-initializer.js',
      sentinel: 'backendChoice',
      absent: null,
    },
    {
      id: 'WM-001',
      file: 'memory/memory-initializer.js',
      sentinel: 'embeddingGeneratorForHybrid',
      absent: null,
    },
    {
      id: 'CF-003',
      file: 'commands/doctor.js',
      sentinel: 'checkMemoryBackend',
      absent: null,
    },
    {
      id: 'CF-003',
      file: 'commands/doctor.js',
      sentinel: 'better-sqlite3',
      absent: null,
    },
    {
      id: 'WM-002',
      file: 'memory/intelligence.js',
      sentinel: 'neuralEnabled',
      absent: null,
    },
    {
      id: 'WM-003',
      file: 'init/helpers-generator.js',
      sentinel: 'importFromAutoMemory',
      absent: 'run init --upgrade for full support',
    },
    {
      id: 'WM-003',
      file: 'init/helpers-generator.js',
      sentinel: 'syncToAutoMemory',
      absent: 'Auto memory sync available',
    },
    {
      id: 'WM-003',
      file: 'init/helpers-generator.js',
      sentinel: 'Active (AutoMemoryBridge)',
      absent: 'Fallback mode',
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
