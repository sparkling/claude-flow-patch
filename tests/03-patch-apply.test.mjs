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
      absent: "topology hierarchical 2>/dev/null', {\n                            stdio",
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
      absent: 'CLAUDE_FLOW_MEMORY_BACKEND',
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
      absent: 'CLAUDE_FLOW_MEMORY_BACKEND',
    },
    {
      id: 'CF-003',
      file: 'commands/doctor.js',
      sentinel: '.claude-flow.json',
      absent: 'config.yaml',
    },
    {
      id: 'WM-002',
      file: 'memory/intelligence.js',
      sentinel: 'neuralEnabled',
      absent: 'config.yaml',
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
    // WM-003 source hook patches (ops 4-6)
    {
      id: 'WM-003',
      file: '../../.claude/helpers/auto-memory-hook.mjs',
      sentinel: 'HybridBackend',
      absent: null,
    },
    {
      id: 'WM-003',
      file: '../../.claude/helpers/auto-memory-hook.mjs',
      sentinel: 'busy_timeout',
      absent: null,
    },
    {
      id: 'WM-003',
      file: '../../.claude/helpers/auto-memory-hook.mjs',
      sentinel: 'Active (AutoMemoryBridge)',
      absent: null,
    },
    // SG-007: deep-clone init options to prevent shallow copy mutation
    {
      id: 'SG-007',
      file: 'commands/init.js',
      sentinel: 'JSON.parse(JSON.stringify(MINIMAL_INIT_OPTIONS))',
      absent: '{ ...MINIMAL_INIT_OPTIONS, targetDir: cwd, force }',
    },
    {
      id: 'SG-007',
      file: 'commands/init.js',
      sentinel: 'JSON.parse(JSON.stringify(FULL_INIT_OPTIONS))',
      absent: '{ ...FULL_INIT_OPTIONS, targetDir: cwd, force }',
    },
    {
      id: 'SG-007',
      file: 'commands/init.js',
      sentinel: 'JSON.parse(JSON.stringify(DEFAULT_INIT_OPTIONS))',
      absent: null,
    },
    // WM-004: source hook config.json reader + createBackend (op a only; b/c need WM-003 first)
    {
      id: 'WM-004',
      file: '../../.claude/helpers/auto-memory-hook.mjs',
      sentinel: 'Read config from .claude-flow/config.json',
      absent: null,
    },
    {
      id: 'WM-004',
      file: '../../.claude/helpers/auto-memory-hook.mjs',
      sentinel: 'function createBackend(config, memPkg)',
      absent: null,
    },
    // WM-005: absorbed into WM-001 — WM-001a now writes config.json reader directly
    // WM-006: absorbed into WM-002 — WM-002c now writes config.json reader directly
    // CF-004: inject readYamlConfig that reads config.json
    {
      id: 'CF-004',
      file: 'commands/config.js',
      sentinel: 'CF-004: Read project config from .claude-flow/config.json',
      absent: null,
    },
    // CF-005: absorbed into CF-003 — CF-003a now writes config.json reader directly
    // SG-008: init generates config.json (replaces yaml)
    {
      id: 'SG-008',
      file: 'init/executor.js',
      sentinel: 'SG-008: Generate config.json (canonical runtime config',
      absent: 'const config = `# Claude Flow V3 Runtime Configuration',
    },
    {
      id: 'SG-008',
      file: 'init/executor.js',
      sentinel: 'config.json      # Runtime configuration',
      absent: null,
    },
    // CF-006: start.js config.json reader (replaces parseSimpleYaml)
    {
      id: 'CF-006',
      file: 'commands/start.js',
      sentinel: 'CF-006: Load configuration from config.json',
      absent: 'parseSimpleYaml',
    },
    // CF-007: status.js isInitialized checks config.json
    {
      id: 'CF-007',
      file: 'commands/status.js',
      sentinel: 'CF-007: Check if project is initialized',
      absent: "const configPath = path.join(cwd, '.claude-flow', 'config.yaml')",
    },
    // CF-008: init.js isInitialized + display strings use config.json
    {
      id: 'CF-008',
      file: 'commands/init.js',
      sentinel: 'CF-008: Check if project is already initialized',
      absent: "const claudeFlowPath = path.join(cwd, '.claude-flow', 'config.yaml');",
    },
    // DOC-001: upstream README.md documentation corrections
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'Valid JSON |',
      absent: 'Valid JSON/YAML',
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'doctor --install',
      absent: null,
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'Mem Backend',
      absent: null,
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: '"backend": "hybrid"',
      absent: '"type": "hybrid"',
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'disables SONA',
      absent: null,
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: '(project directory)',
      absent: null,
    },
    // SG-009: remove --v3-mode from swarm init, make v3 the default
    {
      id: 'SG-009',
      file: 'commands/swarm.js',
      sentinel: "default: 'hierarchical-mesh'",
      absent: "name: 'v3-mode'",
    },
    {
      id: 'SG-009',
      file: 'commands/swarm.js',
      sentinel: "strategy: ctx.flags.strategy || 'development',\n                },",
      absent: "const v3Mode",
    },
    {
      id: 'SG-009',
      file: 'commands/swarm.js',
      sentinel: "'claude-flow swarm init', description: 'Initialize V3 swarm'",
      absent: "'claude-flow swarm init --v3-mode'",
    },
    {
      id: 'SG-009',
      file: 'index.js',
      sentinel: "swarm init                        # Initialize V3 swarm",
      absent: "swarm init --v3-mode",
    },
    {
      id: 'SG-009',
      file: 'init/claudemd-generator.js',
      sentinel: "swarm init\nnpx",
      absent: "swarm init --v3-mode",
    },
    {
      id: 'SG-009',
      file: 'commands/start.js',
      sentinel: "autoScaling: swarmConfig.autoScale !== false\n",
      absent: "v3Mode: true",
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "version: '3.0.0',\n            sparc: sparc,",
      absent: "v3Mode: v3,",
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "{ setting: 'Version', value: config.version },\n                { setting: 'SPARC Mode'",
      absent: "V3 Mode",
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "'version': '3.0.0',\n            'swarm.topology'",
      absent: "'v3Mode': true",
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "topology: 'hierarchical-mesh',\n                maxAgents: 15,\n                autoScale: true",
      absent: null,
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "'swarm.topology': 'hierarchical-mesh'",
      absent: "'swarm.topology': 'hybrid'",
    },
    {
      id: 'SG-009',
      file: 'commands/config.js',
      sentinel: "swarm: { topology: 'hierarchical-mesh', maxAgents: 15 }",
      absent: "swarm: { topology: 'hybrid', maxAgents: 15 }",
    },
    // CF-009: upgrade MINIMAL init preset to v3 runtime defaults
    {
      id: 'CF-009',
      file: 'init/types.js',
      sentinel: "maxAgents: 15",
      absent: "maxAgents: 5",
    },
    // WM-007: wire dead config.json keys into runtime consumers
    {
      id: 'WM-007',
      file: 'memory/memory-initializer.js',
      sentinel: 'cfgMemory',
      absent: 'Read HNSW config from embeddings.json',
      deps: ['WM-001'],
    },
    {
      id: 'WM-007',
      file: 'memory/memory-initializer.js',
      sentinel: 'cfgMemory.agentScopes',
      absent: null,
      deps: ['WM-001'],
    },
    {
      id: 'WM-007',
      file: 'memory/intelligence.js',
      sentinel: 'cfgLearningBridge',
      absent: null,
      deps: ['WM-002'],
    },
    {
      id: 'WM-007',
      file: 'memory/intelligence.js',
      sentinel: 'WM-007c',
      absent: null,
    },
    {
      id: 'WM-007',
      file: 'commands/start.js',
      sentinel: "coordinationStrategy: swarmConfig",
      absent: null,
      deps: ['SG-009', 'CF-006'],
    },
    {
      id: 'WM-007',
      file: 'mcp-tools/hooks-tools.js',
      sentinel: 'WM-007e',
      absent: null,
      deps: ['HK-004'],
    },
    {
      id: 'WM-007',
      file: 'mcp-tools/embeddings-tools.js',
      sentinel: 'configCacheSize',
      absent: null,
    },
    // SG-010: add CLI options to init + fix cacheSize mismatch
    {
      id: 'SG-010',
      file: 'commands/init.js',
      sentinel: "name: 'cache-size'",
      absent: null,
      deps: ['SG-007', 'CF-008'],
    },
    {
      id: 'SG-010',
      file: 'commands/init.js',
      sentinel: 'SG-010b',
      absent: null,
      deps: ['SG-007', 'CF-008'],
    },
    {
      id: 'SG-010',
      file: 'init/executor.js',
      sentinel: 'SG-010c',
      absent: 'cacheSize: 100,',
      deps: ['SG-008'],
    },
    {
      id: 'SG-010',
      file: 'commands/init.js',
      sentinel: 'init --cache-size 512',
      absent: null,
      deps: ['SG-007', 'CF-008'],
    },
    // SG-011: fix stale --topology hierarchical references
    {
      id: 'SG-011',
      file: 'commands/init.js',
      sentinel: 'topology hierarchical-mesh 2>',
      absent: 'topology hierarchical 2>',
      deps: ['SG-006'],
    },
    {
      id: 'SG-011',
      file: 'init/claudemd-generator.js',
      sentinel: 'topology hierarchical-mesh --max-agents 8',
      absent: 'topology hierarchical --max-agents 8',
      deps: ['SG-009'],
    },
    {
      id: 'SG-011',
      file: 'init/executor.js',
      sentinel: 'topology hierarchical-mesh --max-agents 8',
      absent: 'topology hierarchical --max-agents 8',
      deps: ['SG-008'],
    },
    // DOC-001 ops o-v: README topology + v3-mode cleanup
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'hierarchical-mesh',
      absent: 'swarm init --v3-mode',
    },
    {
      id: 'DOC-001',
      file: '../../README.md',
      sentinel: 'hierarchical-mesh',
      absent: 'topology="hierarchical"',
    },
  ];

  for (const { id, file, sentinel, absent, deps } of TESTS) {
    it(`${id} applies correctly`, () => {
      // Pre-apply dependency patches if specified
      if (deps) {
        for (const dep of deps) {
          const dr = runPatch(dep, fixture.base);
          assert.equal(dr.status, 0, `${id} dep ${dep} exit code: ${dr.stderr}`);
        }
      }
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
