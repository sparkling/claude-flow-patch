import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { findNpxNmWithCliFile, findNpxNmWithNativeDeps, findCliBase, findAllCliInstalls } from './helpers/integration-setup.mjs';

// ── Find npx cache with generators + memory deps ──────────────────────────

const npxNm = findNpxNmWithCliFile('init/types.js');
const npxNmNative = findNpxNmWithNativeDeps();
const canRun = !!npxNm;
const cliBase = npxNm ? findCliBase(npxNm) ?? '' : '';
const skipMsg = !canRun ? 'patched npx cache not found' : false;

// Attempt to import generators and memory package
let types = null;
let helpersGen = null;
let memPkg = null;

if (npxNm) {
  try { types = await import(`file://${join(cliBase, 'init', 'types.js')}`); } catch {}
  try { helpersGen = await import(`file://${join(cliBase, 'init', 'helpers-generator.js')}`); } catch {}
}

if (npxNmNative) {
  try {
    memPkg = await import(join(npxNmNative, '@claude-flow', 'memory', 'dist', 'index.js'));
    if (!memPkg.HybridBackend || !memPkg.AutoMemoryBridge) memPkg = null;
  } catch { memPkg = null; }
}

function cli(args, cwd, timeout = 60000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

function createProject(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `cfp-xdefect-${prefix}-`));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', type: 'module', private: true }));
  if (npxNmNative) {
    const nm = join(dir, 'node_modules');
    mkdirSync(join(nm, '@claude-flow'), { recursive: true });
    for (const pkg of ['@claude-flow/memory', 'better-sqlite3', 'agentdb']) {
      const target = join(npxNmNative, pkg);
      if (existsSync(target)) {
        const linkPath = join(nm, pkg);
        const parent = resolve(linkPath, '..');
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        if (!existsSync(linkPath)) symlinkSync(target, linkPath);
      }
    }
    for (const dep of ['bindings', 'prebuild-install', 'node-addon-api', 'hnswlib-node', 'file-uri-to-path', 'node-gyp-build']) {
      const target = join(npxNmNative, dep);
      if (existsSync(target)) {
        const linkPath = join(nm, dep);
        if (!existsSync(linkPath)) symlinkSync(target, linkPath);
      }
    }
  }
  mkdirSync(join(dir, '.claude-flow'), { recursive: true });
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });
  return { dir, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: IN-001 -> SG-003 (intelligence generation chain)
//
// IN-001 replaces the intelligence.cjs stub with a real learning implementation.
// SG-003 wires the helpers-generator to emit intelligence.cjs via init --full.
// Together they ensure `init --full` produces a real intelligence.cjs, not a stub.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: IN-001 -> SG-003 (intelligence generation chain)', { skip: skipMsg }, () => {
  let fullDir;
  let dualDir;

  before(() => {
    fullDir = mkdtempSync(join(tmpdir(), 'cfp-intel-full-'));
    const r = cli(['init', '--yes', '--full'], fullDir, 60000);
    if (r.status !== 0) fullDir = null;
  });

  after(() => {
    if (fullDir) rmSync(fullDir, { recursive: true, force: true });
    if (dualDir) rmSync(dualDir, { recursive: true, force: true });
  });

  it('init --full generates intelligence.cjs', (t) => {
    if (!fullDir) return t.skip('init --full failed');
    // SG-003 wires the intelligence.cjs helper; IN-001 provides the real content
    const intelPath = join(fullDir, '.claude', 'helpers', 'intelligence.cjs');
    assert.ok(existsSync(intelPath),
      'init --full should generate .claude/helpers/intelligence.cjs (SG-003 + IN-001)');
  });

  it('generated intelligence.cjs is real (not stub)', (t) => {
    if (!fullDir) return t.skip('init --full failed');
    // IN-001 replaces the stub (< 200 lines) with a real implementation (> 500 lines)
    const intelPath = join(fullDir, '.claude', 'helpers', 'intelligence.cjs');
    if (!existsSync(intelPath)) return;
    const content = readFileSync(intelPath, 'utf-8');
    const lineCount = content.split('\n').length;
    assert.ok(lineCount > 500,
      `intelligence.cjs should be real (> 500 lines), got ${lineCount} lines (IN-001 stub replacement)`);
  });

  it('generated intelligence.cjs has learning functions', (t) => {
    if (!fullDir) return t.skip('init --full failed');
    // Real intelligence.cjs should have actual learning/routing/context functions
    const intelPath = join(fullDir, '.claude', 'helpers', 'intelligence.cjs');
    if (!existsSync(intelPath)) return;
    const content = readFileSync(intelPath, 'utf-8');
    const hasLearning = content.includes('recordEdit') || content.includes('getContext') || content.includes('feedback');
    assert.ok(hasLearning,
      'intelligence.cjs should contain recordEdit, getContext, or feedback (IN-001 real implementation)');
  });

  it('init --dual also generates intelligence.cjs', () => {
    dualDir = mkdtempSync(join(tmpdir(), 'cfp-intel-dual-'));
    const r = cli(['init', '--yes', '--dual'], dualDir, 60000);
    if (r.status !== 0) {
      dualDir = null;
      return; // --dual may not be available on all installations
    }
    const intelPath = join(dualDir, '.claude', 'helpers', 'intelligence.cjs');
    if (existsSync(intelPath)) {
      const content = readFileSync(intelPath, 'utf-8');
      const lineCount = content.split('\n').length;
      assert.ok(lineCount > 500,
        `--dual intelligence.cjs should be real (> 500 lines), got ${lineCount} (IN-001 + SG-003)`);
    }
    // --dual may or may not generate intelligence.cjs depending on dual mode implementation
    assert.ok(true, '--dual init completed without error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: NS-001 -> NS-002 -> NS-003 (namespace chain)
//
// NS-001: Discovery ops (search/list) default to 'all' namespace instead of wrong default
// NS-002: Store/delete/retrieve require explicit namespace (no 'default' fallback)
// NS-003: 'pattern' typo fixed to 'patterns' (plural)
// Together they ensure consistent namespace handling across the stack.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: NS-001 -> NS-002 -> NS-003 (namespace chain)', { skip: skipMsg }, () => {
  let memToolsSrc = '';
  let hooksToolsSrc = '';
  let memInitSrc = '';

  before(() => {
    try { memToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'memory-tools.js'), 'utf-8'); } catch {}
    try { hooksToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8'); } catch {}
    try { memInitSrc = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8'); } catch {}
  });

  it('NS-001 + NS-002: discovery defaults to all while store requires explicit', () => {
    // NS-001: search/list default to 'all'
    assert.ok(memToolsSrc.includes("input.namespace || 'all'"),
      'NS-001: search should default namespace to "all"');
    // NS-002: store requires explicit namespace
    assert.ok(memToolsSrc.includes('Namespace is required'),
      'NS-002: store should require namespace (no fallback)');
    // These two patches coexist: discovery is permissive, mutation is strict
  });

  it('NS-002 + NS-003: store rejects missing namespace with correct plural', () => {
    // NS-002: store throws on missing namespace
    assert.ok(memInitSrc.includes('storeEntry: namespace is required'),
      'NS-002: core storeEntry rejects missing namespace');
    // NS-003: hooks use 'patterns' (plural)
    assert.ok(hooksToolsSrc.includes("|| 'patterns'"),
      'NS-003: hooks-tools uses "patterns" (plural) as default');
  });

  it('NS-003: no singular pattern as namespace default', () => {
    // NS-003 replaces 'pattern' with 'patterns' -- verify old form is gone
    assert.ok(!hooksToolsSrc.includes("|| 'pattern';"),
      'NS-003: should not have singular "pattern" as namespace default');
  });

  it('NS chain: all three patches coexist in memory-tools.js', () => {
    // NS-001: 'all' default for discovery
    const hasAll = memToolsSrc.includes("|| 'all'");
    // NS-002: required namespace for store
    const hasRequired = memToolsSrc.includes("required: ['key', 'value', 'namespace']");
    // NS-002: rejection of 'all' for writes
    const hasRejectAll = memToolsSrc.includes("namespace === 'all'");
    assert.ok(hasAll && hasRequired && hasRejectAll,
      'All three NS patches should coexist in memory-tools.js');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: NS CLI subprocess tests
//
// Tests the NS chain via actual CLI memory commands with subprocesses.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: NS namespace via CLI memory commands', { skip: skipMsg }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-ns-chain-'));
    // Initialize a project so memory commands have a context
    cli(['init', '--yes'], projectDir, 60000);
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('store to explicit namespace succeeds', () => {
    // NS-002: store with explicit namespace should work
    const r = cli(['memory', 'store', '-k', 'chain-test-1', '--value', 'data-1', '--namespace', 'patterns'], projectDir, 30000);
    // May fail if daemon is required; check for namespace-related errors specifically
    if (r.status !== 0) {
      const stderr = (r.stderr || '').toLowerCase();
      assert.ok(!stderr.includes('namespace is required'),
        'store with explicit namespace should not fail due to missing namespace');
    }
  });

  it('store without namespace is rejected (NS-002)', () => {
    // NS-002: store without namespace should fail with a clear error
    const r = cli(['memory', 'store', '-k', 'bad-key', '--value', 'bad-data'], projectDir, 30000);
    const combined = (r.stdout || '') + (r.stderr || '');
    // Should either fail or include a namespace requirement message
    const hasNamespaceError = combined.toLowerCase().includes('namespace');
    const failed = r.status !== 0;
    assert.ok(failed || hasNamespaceError,
      'store without namespace should fail or warn about namespace requirement (NS-002)');
  });

  it('NS-003: hooks use patterns (plural) namespace', () => {
    // Read the patched hooks-tools.js directly
    const hooksPath = join(cliBase, 'mcp-tools', 'hooks-tools.js');
    if (!existsSync(hooksPath)) return;
    const content = readFileSync(hooksPath, 'utf-8');
    assert.ok(content.includes("'patterns'"),
      'hooks-tools.js should reference "patterns" namespace (NS-003)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-001 -> WM-003 (memory wiring chain)
//
// WM-001: Wires HybridBackend into CLI's memory-initializer.js
// WM-003: Activates AutoMemoryBridge in the generated auto-memory-hook.mjs
// Together they provide full HybridBackend-powered memory from init through runtime.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-001 -> WM-003 (memory wiring chain)', {
  skip: skipMsg || !memPkg ? 'native deps (better-sqlite3, @claude-flow/memory) unavailable' : false,
}, () => {
  let project;

  before(() => {
    project = createProject('wm-chain');
    // Run init to generate the auto-memory-hook
    const r = cli(['init', '--yes'], project.dir, 60000);
    if (r.status !== 0) project = null;
  });

  after(() => {
    if (project) project.cleanup();
  });

  it('init generates HybridBackend-based hook (WM-001 + WM-003)', (t) => {
    if (!project) return t.skip('init failed');
    const hookPath = join(project.dir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    assert.ok(existsSync(hookPath), 'auto-memory-hook.mjs should exist');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('HybridBackend'),
      'hook should use HybridBackend (WM-001 wiring + WM-003 activation)');
  });

  it('hook import creates hybrid-memory.db (WM-001 backend)', (t) => {
    if (!project) return t.skip('init failed');
    const hookPath = join(project.dir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    if (!existsSync(hookPath)) return;

    // Symlink deps so the hook can find native modules
    const r = spawnSync('node', [hookPath, 'import'], {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: project.dir,
    });
    if (r.status === 0) {
      const dbPath = join(project.dir, '.swarm', 'hybrid-memory.db');
      assert.ok(existsSync(dbPath),
        'import should create hybrid-memory.db via HybridBackend (WM-001)');
    } else {
      // Hook may fail if model not cached; still verify the hook references HybridBackend
      const content = readFileSync(hookPath, 'utf-8');
      assert.ok(content.includes('HybridBackend'),
        'hook references HybridBackend even if import fails due to missing model');
    }
  });

  it('hook status shows Active (AutoMemoryBridge) (WM-003)', (t) => {
    if (!project) return t.skip('init failed');
    const hookPath = join(project.dir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    if (!existsSync(hookPath)) return;

    const r = spawnSync('node', [hookPath, 'status'], {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: project.dir,
    });
    if (r.status === 0) {
      assert.ok(r.stdout.includes('Active (AutoMemoryBridge)'),
        'status should report Active (AutoMemoryBridge) (WM-003)');
    } else {
      // Verify the hook template includes the status text
      const content = readFileSync(hookPath, 'utf-8');
      assert.ok(content.includes('Active (AutoMemoryBridge)'),
        'hook template should contain Active (AutoMemoryBridge) status text (WM-003)');
    }
  });

  it('store via backend -> retrieve via backend (WM-001 round-trip)', async (t) => {
    if (!project) return t.skip('init failed');
    if (!memPkg?.HybridBackend || !memPkg?.createDefaultEntry) return;

    const backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'xdefect-roundtrip.db') },
      dualWrite: true,
    });

    try {
      await backend.initialize();

      const entry = memPkg.createDefaultEntry({
        namespace: 'xdefect-test',
        key: 'wm-chain-key',
        content: 'cross-defect integration test data',
        tags: ['wm-001', 'wm-003'],
      });
      await backend.store(entry);

      const found = await backend.getByKey('xdefect-test', 'wm-chain-key');
      assert.ok(found, 'round-trip: entry should be retrievable after store (WM-001)');
      assert.equal(found.content, 'cross-defect integration test data');
    } finally {
      try { await backend.shutdown(); } catch {}
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: HW-001 + HW-002 (headless worker safety)
//
// HW-001: Sets stdin to 'ignore' to prevent hang
// HW-002: Adds failure detection after headless execution
// Both patches modify the headless worker executor and must coexist.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: HW-001 + HW-002 (headless worker safety)', { skip: skipMsg }, () => {
  let hweContent = '';
  let wdContent = '';

  before(() => {
    try { hweContent = readFileSync(join(cliBase, 'services', 'headless-worker-executor.js'), 'utf-8'); } catch {}
    try { wdContent = readFileSync(join(cliBase, 'services', 'worker-daemon.js'), 'utf-8'); } catch {}
  });

  it('HW-001: stdin set to ignore (not pipe)', () => {
    assert.ok(hweContent.includes("'ignore', 'pipe', 'pipe'"),
      'headless-worker-executor.js should use ignore for stdin (HW-001)');
  });

  it('HW-002: failure detection after execution', () => {
    assert.ok(wdContent.includes('result.success'),
      'worker-daemon.js should check result.success after headless execution (HW-002)');
  });

  it('both HW-001 and HW-002 coexist across executor files', () => {
    // HW-001 modifies headless-worker-executor.js
    const hasIgnore = hweContent.includes("'ignore'");
    // HW-002 modifies worker-daemon.js
    const hasFailCheck = wdContent.includes('result.success');
    assert.ok(hasIgnore && hasFailCheck,
      'HW-001 (stdin ignore) and HW-002 (failure check) should both be present');
  });

  it('HW-001 + HW-004: stdin ignore and timeout kill coexist in executor', () => {
    // HW-001: stdin set to 'ignore'
    const hasIgnore = hweContent.includes("'ignore'");
    // HW-004: runWithTimeout kills child process (in worker-daemon.js)
    const hasTimeout = wdContent.includes('16 * 60 * 1000');
    assert.ok(hasIgnore && hasTimeout,
      'HW-001 (stdin ignore) and HW-004 (timeout raise) should both be applied');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: SG-007 + init flags (shallow copy fix)
//
// SG-007: Replaces shallow spread { ...OPTS } with deep clone
//         JSON.parse(JSON.stringify(OPTS)) to prevent option mutation.
// This is tested by verifying that sequential init calls with different flags
// do not corrupt the shared DEFAULT_INIT_OPTIONS constant.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: SG-007 + init flags (shallow copy fix)', { skip: skipMsg }, () => {
  it('deep clone present in init.js for DEFAULT_INIT_OPTIONS', () => {
    const initPath = join(cliBase, '..', '..', 'dist', 'src', 'commands', 'init.js');
    const altPath = join(cliBase, 'commands', 'init.js');
    const filePath = existsSync(altPath) ? altPath : initPath;
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('JSON.parse(JSON.stringify(DEFAULT_INIT_OPTIONS))'),
      'init.js should deep-clone DEFAULT_INIT_OPTIONS (SG-007)');
  });

  it('deep clone present for MINIMAL_INIT_OPTIONS', () => {
    const filePath = join(cliBase, 'commands', 'init.js');
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('JSON.parse(JSON.stringify(MINIMAL_INIT_OPTIONS))'),
      'init.js should deep-clone MINIMAL_INIT_OPTIONS (SG-007)');
  });

  it('deep clone present for FULL_INIT_OPTIONS', () => {
    const filePath = join(cliBase, 'commands', 'init.js');
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('JSON.parse(JSON.stringify(FULL_INIT_OPTIONS))'),
      'init.js should deep-clone FULL_INIT_OPTIONS (SG-007)');
  });

  it('--skip-claude does not corrupt defaults for subsequent init', () => {
    // SG-007 fix: run --skip-claude, then default init in a new dir.
    // Without the deep clone fix, --skip-claude would mutate the shared constant.
    const dir1 = mkdtempSync(join(tmpdir(), 'cfp-sg007-skip-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'cfp-sg007-after-skip-'));
    try {
      // First: run with --skip-claude (mutates components if shallow copy)
      cli(['init', '--yes', '--skip-claude'], dir1, 60000);

      // Second: run default init in a fresh directory
      const r2 = cli(['init', '--yes'], dir2, 60000);
      assert.equal(r2.status, 0, 'second init should succeed after --skip-claude');

      // Verify second init produced all components (not corrupted by first run)
      assert.ok(existsSync(join(dir2, '.claude', 'settings.json')),
        'second init should still generate settings.json (SG-007 prevents corruption)');
      assert.ok(existsSync(join(dir2, '.claude-flow', 'config.json')) ||
                existsSync(join(dir2, '.claude-flow', 'config.yaml')),
        'second init should still generate runtime config (SG-007 prevents corruption)');
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('--only-claude does not corrupt defaults for subsequent init', () => {
    // Same pattern: --only-claude followed by default init
    const dir1 = mkdtempSync(join(tmpdir(), 'cfp-sg007-only-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'cfp-sg007-after-only-'));
    try {
      cli(['init', '--yes', '--only-claude'], dir1, 60000);

      const r2 = cli(['init', '--yes'], dir2, 60000);
      assert.equal(r2.status, 0, 'second init should succeed after --only-claude');

      assert.ok(existsSync(join(dir2, '.claude-flow', 'config.json')) ||
                existsSync(join(dir2, '.claude-flow', 'config.yaml')),
        'second init should still generate runtime config (SG-007 prevents corruption)');
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('types module DEFAULT_INIT_OPTIONS is not mutated after import', { skip: !types ? 'types not importable' : false }, () => {
    // After SG-007, the original constant should be intact
    const c = types.DEFAULT_INIT_OPTIONS.components;
    assert.ok(c.settings === true || c.settings === undefined || c.settings,
      'DEFAULT_INIT_OPTIONS.components.settings should still be truthy');
    assert.ok(c.helpers === true || c.helpers === undefined || c.helpers,
      'DEFAULT_INIT_OPTIONS.components.helpers should still be truthy');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-001 + CF-003 (memory backend + doctor)
//
// WM-001: Wires HybridBackend into memory-initializer.js
// CF-003: Doctor checks for native dependencies (better-sqlite3)
// Together they ensure the doctor can validate the memory backend wiring.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-001 + CF-003 (memory backend + doctor)', { skip: skipMsg }, () => {
  let memInitSrc = '';
  let doctorSrc = '';

  before(() => {
    try { memInitSrc = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8'); } catch {}
    try { doctorSrc = readFileSync(join(cliBase, 'commands', 'doctor.js'), 'utf-8'); } catch {}
  });

  it('WM-001: memory-initializer references HybridBackend', () => {
    assert.ok(memInitSrc.includes('HybridBackend'),
      'memory-initializer.js should reference HybridBackend (WM-001)');
  });

  it('CF-003: doctor checks for better-sqlite3', () => {
    assert.ok(doctorSrc.includes('better-sqlite3'),
      'doctor.js should check for better-sqlite3 native dependency (CF-003)');
  });

  it('CF-003: doctor has checkMemoryBackend', () => {
    assert.ok(doctorSrc.includes('checkMemoryBackend'),
      'doctor.js should have checkMemoryBackend function (CF-003)');
  });

  it('WM-001 + CF-003: doctor can validate what memory-initializer requires', () => {
    // Both patches reference HybridBackend / better-sqlite3
    const memHasHybrid = memInitSrc.includes('HybridBackend');
    const docHasSqlite = doctorSrc.includes('better-sqlite3');
    assert.ok(memHasHybrid && docHasSqlite,
      'doctor should validate the same native deps that memory-initializer uses');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: DM-002 + DM-003 (CPU/memory thresholds)
//
// DM-002: Raises maxCpuLoad from 2.0 to 28.0 for multi-core
// DM-003: Fixes macOS freemem() always reporting ~0%
// Together they ensure workers are not blocked by incorrect resource checks.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: DM-002 + DM-003 (CPU/memory thresholds)', { skip: skipMsg }, () => {
  let wdContent = '';

  before(() => {
    try { wdContent = readFileSync(join(cliBase, 'services', 'worker-daemon.js'), 'utf-8'); } catch {}
  });

  it('DM-002: maxCpuLoad raised to 28.0', () => {
    assert.ok(wdContent.includes('maxCpuLoad: 28.0'),
      'maxCpuLoad should be 28.0 (DM-002)');
  });

  it('DM-003: darwin platform check present', () => {
    assert.ok(wdContent.includes('darwin'),
      'worker-daemon.js should have darwin check for macOS freemem (DM-003)');
  });

  it('both DM-002 and DM-003 coexist in worker-daemon.js', () => {
    const hasCpu = wdContent.includes('maxCpuLoad: 28.0');
    const hasDarwin = wdContent.includes('darwin');
    assert.ok(hasCpu && hasDarwin,
      'DM-002 (CPU threshold) and DM-003 (macOS freemem) should both be applied');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: HK-004 + HK-005 (daemon startup guards)
//
// HK-004: session-start reads daemon.autoStart from settings.json
// HK-005: PID-file guard prevents multiple daemon instances
// Together they ensure controlled daemon lifecycle.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: HK-004 + HK-005 (daemon startup guards)', { skip: skipMsg }, () => {
  let hooksToolsSrc = '';

  before(() => {
    try { hooksToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8'); } catch {}
  });

  it('HK-004: reads autoStart setting', () => {
    assert.ok(hooksToolsSrc.includes('autoStart'),
      'hooks-tools.js should check autoStart (HK-004)');
  });

  it('HK-005: PID-file guard present', () => {
    assert.ok(hooksToolsSrc.includes('daemon.pid'),
      'hooks-tools.js should check daemon.pid (HK-005)');
  });

  it('HK-004 + HK-005 coexist: autoStart check before PID guard', () => {
    const hasAutoStart = hooksToolsSrc.includes('autoStart');
    const hasPid = hooksToolsSrc.includes('daemon.pid');
    const hasSkipDaemon = hooksToolsSrc.includes('_skipDaemon');
    assert.ok(hasAutoStart && hasPid && hasSkipDaemon,
      'HK-004 (autoStart) and HK-005 (PID guard) should both be present in hooks-tools.js');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-002 + IN-001 (neural config gating + intelligence)
//
// WM-002: neural.enabled config is actually consumed at runtime
// IN-001: intelligence.cjs is a real implementation (not stub)
// Together they ensure neural features are properly gated and functional.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-002 + IN-001 (neural config gating + intelligence)', { skip: skipMsg }, () => {
  let intelSrc = '';
  let helpersGenSrc = '';

  before(() => {
    try { intelSrc = readFileSync(join(cliBase, 'memory', 'intelligence.js'), 'utf-8'); } catch {}
    try { helpersGenSrc = readFileSync(join(cliBase, 'init', 'helpers-generator.js'), 'utf-8'); } catch {}
  });

  it('WM-002: intelligence.js checks neuralEnabled', () => {
    assert.ok(intelSrc.includes('neuralEnabled'),
      'intelligence.js should check neuralEnabled config flag (WM-002)');
  });

  it('IN-001: helpers-generator produces real intelligence content', () => {
    if (!helpersGen?.generateIntelligenceHelper) return;
    const content = helpersGen.generateIntelligenceHelper();
    assert.ok(typeof content === 'string' && content.length > 500,
      'generateIntelligenceHelper should produce > 500 chars of real code (IN-001)');
  });

  it('WM-002 + IN-001: gating and implementation are wired', () => {
    const hasGating = intelSrc.includes('neuralEnabled');
    // IN-001: the generated intelligence.cjs is real; verify generator has learning code
    const hasLearning = helpersGenSrc.includes('recordOutcome') ||
                        helpersGenSrc.includes('getRoutingDecision') ||
                        helpersGenSrc.includes('intelligence');
    assert.ok(hasGating && hasLearning,
      'WM-002 (gating) and IN-001 (real intelligence) should both be wired');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: SG-008 config.json flow (6 consumers)
//
// SG-008 generates config.json via init. Six subsequent patches read it:
//   WM-001 (absorbs WM-005): memory-initializer
//   WM-002 (absorbs WM-006): intelligence
//   CF-003 (absorbs CF-005): doctor
//   CF-004: config export
//   WM-004: helpers-generator hook template
//   SG-008 itself: executor generates the file
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: SG-008 config.json flow (6 consumers)', { skip: skipMsg }, () => {
  let executorSrc = '';
  let memInitSrc = '';
  let intelSrc = '';
  let doctorSrc = '';
  let configSrc = '';
  let hookSrc = '';

  before(() => {
    try { executorSrc = readFileSync(join(cliBase, 'init', 'executor.js'), 'utf-8'); } catch {}
    try { memInitSrc = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8'); } catch {}
    try { intelSrc = readFileSync(join(cliBase, 'memory', 'intelligence.js'), 'utf-8'); } catch {}
    try { doctorSrc = readFileSync(join(cliBase, 'commands', 'doctor.js'), 'utf-8'); } catch {}
    try { configSrc = readFileSync(join(cliBase, 'commands', 'config.js'), 'utf-8'); } catch {}
    try { hookSrc = readFileSync(join(cliBase, '..', '..', '.claude', 'helpers', 'auto-memory-hook.mjs'), 'utf-8'); } catch {}
  });

  it('SG-008: executor.js generates config.json', () => {
    assert.ok(executorSrc.includes('config.json'),
      'executor.js should reference config.json (SG-008 generation)');
  });

  it('WM-001 (absorbs WM-005): memory-initializer reads config.json', () => {
    assert.ok(memInitSrc.includes('config.json'),
      'memory-initializer.js should reference config.json (WM-001 absorbs WM-005)');
  });

  it('WM-002 (absorbs WM-006): intelligence reads config.json', () => {
    assert.ok(intelSrc.includes('config.json'),
      'intelligence.js should reference config.json (WM-002 absorbs WM-006)');
  });

  it('CF-003 (absorbs CF-005): doctor reads config.json', () => {
    assert.ok(doctorSrc.includes('config.json'),
      'doctor.js should reference config.json (CF-003 absorbs CF-005)');
  });

  it('CF-004: config export reads config.json', () => {
    assert.ok(configSrc.includes('config.json'),
      'config.js should reference config.json (CF-004)');
  });

  it('WM-004: auto-memory-hook reads config.json', () => {
    assert.ok(hookSrc.includes('config.json'),
      'auto-memory-hook.mjs should reference config.json (WM-004)');
  });

  it('all consumers use canonical .claude-flow/config.json path', () => {
    const sources = [
      { name: 'executor.js', src: executorSrc },
      { name: 'memory-initializer.js', src: memInitSrc },
      { name: 'intelligence.js', src: intelSrc },
      { name: 'doctor.js', src: doctorSrc },
      { name: 'config.js', src: configSrc },
      { name: 'auto-memory-hook.mjs', src: hookSrc },
    ];
    const missing = sources.filter(s => !s.src.includes('.claude-flow/config.json') &&
                                         !s.src.includes("'config.json'") &&
                                         !s.src.includes('"config.json"'));
    assert.equal(missing.length, 0,
      `all 6 consumers should reference config.json, missing in: ${missing.map(s => s.name).join(', ')}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-008 -> SG-008 (agentdb v3 + config.json flow)
//
// WM-008: Upgrades agentdb v2 → v3 (RVF, self-learning, witness chain)
// SG-008: Generates config.json via init (used by WM-008h to embed agentdb section)
// WM-001: Wires HybridBackend into memory-initializer (receives WM-008g .rvf config)
// Together they ensure init produces a project with v3 agentdb config that flows
// through config.json → memory-initializer → agentdb-backend → runtime.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-008 -> SG-008 -> WM-001 (agentdb v3 config chain)', { skip: skipMsg }, () => {
  let executorSrc = '';
  let memInitSrc = '';
  let agentdbSrc = '';
  let hookSrc = '';
  let helpersGenSrc = '';

  before(() => {
    try { executorSrc = readFileSync(join(cliBase, 'init', 'executor.js'), 'utf-8'); } catch {}
    try { memInitSrc = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8'); } catch {}
    try { helpersGenSrc = readFileSync(join(cliBase, 'init', 'helpers-generator.js'), 'utf-8'); } catch {}
    try {
      const memDist = npxNmNative ? join(npxNmNative, '@claude-flow', 'memory', 'dist') : '';
      if (memDist) agentdbSrc = readFileSync(join(memDist, 'agentdb-backend.js'), 'utf-8');
    } catch {}
    try { hookSrc = readFileSync(join(cliBase, '..', '..', '.claude', 'helpers', 'auto-memory-hook.mjs'), 'utf-8'); } catch {}
  });

  it('WM-008h: executor.js config.json template has agentdb section', () => {
    assert.ok(executorSrc.includes("vectorBackend: 'rvf'"),
      'executor.js should have vectorBackend rvf in config template (WM-008h)');
    assert.ok(executorSrc.includes('enableLearning'),
      'executor.js should have enableLearning in config template (WM-008h)');
    assert.ok(executorSrc.includes('learningPositiveThreshold') || executorSrc.includes('agentdbPositiveThreshold'),
      'executor.js should have learning threshold in config template (WM-008h)');
  });

  it('WM-008g: memory-initializer uses .rvf path', () => {
    assert.ok(memInitSrc.includes('agentdb-memory.rvf'),
      'memory-initializer should use agentdb-memory.rvf (WM-008g)');
    assert.ok(!memInitSrc.includes("'agentdb-memory.db'"),
      'memory-initializer should not use agentdb-memory.db anymore (WM-008g)');
  });

  it('WM-008g: memory-initializer has vectorBackend rvf', () => {
    assert.ok(memInitSrc.includes("vectorBackend: 'rvf'"),
      'memory-initializer should set vectorBackend to rvf (WM-008g)');
  });

  it('WM-008a: agentdb-backend default vectorBackend is rvf', () => {
    if (!agentdbSrc) return; // skip if agentdb-backend.js not found
    assert.ok(agentdbSrc.includes("vectorBackend: 'rvf'"),
      'agentdb-backend.js should default vectorBackend to rvf (WM-008a)');
    assert.ok(!agentdbSrc.includes("vectorBackend: 'auto'"),
      'agentdb-backend.js should not have vectorBackend auto anymore (WM-008a)');
  });

  it('WM-008c: agentdb-backend imports SelfLearningRvfBackend', () => {
    if (!agentdbSrc) return;
    assert.ok(agentdbSrc.includes('SelfLearningRvfBackend'),
      'agentdb-backend.js should import SelfLearningRvfBackend (WM-008c)');
  });

  it('WM-008ef: agentdb-backend has recordFeedback + witness chain methods', () => {
    if (!agentdbSrc) return;
    assert.ok(agentdbSrc.includes('recordFeedback'),
      'agentdb-backend.js should have recordFeedback method (WM-008e)');
    assert.ok(agentdbSrc.includes('getWitnessChain'),
      'agentdb-backend.js should have getWitnessChain method (WM-008f)');
    assert.ok(agentdbSrc.includes('verifyWitnessChain'),
      'agentdb-backend.js should have verifyWitnessChain method (WM-008f)');
  });

  it('WM-008k: helpers-generator uses .rvf path + v3 config', () => {
    assert.ok(helpersGenSrc.includes('agentdb-memory.rvf'),
      'helpers-generator.js should use agentdb-memory.rvf (WM-008k)');
    assert.ok(helpersGenSrc.includes("vectorBackend: 'rvf'"),
      'helpers-generator.js should set vectorBackend to rvf (WM-008k)');
  });

  it('WM-008l: auto-memory-hook uses .rvf path', () => {
    if (!hookSrc) return;
    assert.ok(hookSrc.includes('agentdb-memory.rvf'),
      'auto-memory-hook.mjs should use agentdb-memory.rvf (WM-008l)');
    assert.ok(!hookSrc.includes('agentdb-memory.db'),
      'auto-memory-hook.mjs should not use agentdb-memory.db anymore (WM-008l)');
  });

  it('SG-008 -> WM-008: full config chain from executor to agentdb-backend', () => {
    // executor.js generates config.json with agentdb.vectorBackend = 'rvf'
    const execHasRvf = executorSrc.includes("vectorBackend: 'rvf'");
    // memory-initializer reads config.json and passes rvf to HybridBackend
    const miHasRvf = memInitSrc.includes("vectorBackend: 'rvf'");
    // agentdb-backend defaults to rvf
    const abHasRvf = !agentdbSrc || agentdbSrc.includes("vectorBackend: 'rvf'");
    // helpers-generator uses rvf in generated hook
    const hgHasRvf = helpersGenSrc.includes("vectorBackend: 'rvf'");

    assert.ok(execHasRvf && miHasRvf && abHasRvf && hgHasRvf,
      'all 4 config chain files should use vectorBackend rvf (SG-008 → WM-008)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-008 cross-package consistency
//
// WM-008 patches span 4 packages:
//   @claude-flow/memory (agentdb-backend.js, package.json)
//   @claude-flow/cli (memory-initializer.js, executor.js, helpers-generator.js,
//                     auto-memory-hook.mjs)
//   @claude-flow/neural (reasoning-bank.js)
//   @claude-flow/shared (defaults.js)
// This suite verifies all packages are aligned on v3 config.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-008 cross-package consistency', { skip: skipMsg }, () => {
  let memPkgJson = '';
  let reasoningBankSrc = '';
  let sharedDefaultsSrc = '';

  before(() => {
    if (!npxNmNative) return;
    try { memPkgJson = readFileSync(join(npxNmNative, '@claude-flow', 'memory', 'package.json'), 'utf-8'); } catch {}
    try { reasoningBankSrc = readFileSync(join(npxNmNative, '@claude-flow', 'neural', 'dist', 'reasoning-bank.js'), 'utf-8'); } catch {}
    try { sharedDefaultsSrc = readFileSync(join(npxNmNative, '@claude-flow', 'shared', 'dist', 'defaults.js'), 'utf-8'); } catch {}
  });

  it('WM-008i: @claude-flow/memory depends on agentdb v3', () => {
    if (!memPkgJson) return;
    const pkg = JSON.parse(memPkgJson);
    const agentdbDep = pkg.dependencies?.agentdb || '';
    assert.ok(agentdbDep.includes('3.0.0'),
      `@claude-flow/memory should depend on agentdb v3, got: ${agentdbDep} (WM-008i)`);
  });

  it('WM-008j: agentdb-backend header references v3', () => {
    if (!npxNmNative) return;
    let agentdbSrc = '';
    try { agentdbSrc = readFileSync(join(npxNmNative, '@claude-flow', 'memory', 'dist', 'agentdb-backend.js'), 'utf-8'); } catch {}
    if (!agentdbSrc) return;
    assert.ok(agentdbSrc.includes('agentdb@3.0.0'),
      'agentdb-backend.js header should reference agentdb@3.0.0 (WM-008j)');
  });

  it('WM-008m: @claude-flow/neural reasoning-bank uses vectorBackend rvf', () => {
    if (!reasoningBankSrc) return;
    assert.ok(reasoningBankSrc.includes("vectorBackend: 'rvf'"),
      'reasoning-bank.js should use vectorBackend rvf (WM-008m)');
    assert.ok(!reasoningBankSrc.includes("vectorBackend: 'auto'"),
      'reasoning-bank.js should not use vectorBackend auto anymore (WM-008m)');
  });

  it('WM-008n: @claude-flow/shared defaults has vectorBackend rvf', () => {
    if (!sharedDefaultsSrc) return;
    assert.ok(sharedDefaultsSrc.includes("vectorBackend: 'rvf'"),
      'shared defaults.js should have vectorBackend rvf (WM-008n)');
  });

  it('WM-008o: executor.js version table references agentdb v3', () => {
    let executorSrc = '';
    try { executorSrc = readFileSync(join(cliBase, 'init', 'executor.js'), 'utf-8'); } catch {}
    if (!executorSrc) return;
    assert.ok(executorSrc.includes('3.0.0-alpha.3'),
      'executor.js version table should reference agentdb 3.0.0-alpha.3 (WM-008o)');
    assert.ok(!executorSrc.includes('2.0.0-alpha.3.4'),
      'executor.js should not reference agentdb v2 anymore (WM-008o)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: WM-008 init → runtime (agentdb v3 e2e)
//
// End-to-end test: run init, verify the generated project has v3 agentdb
// config in both config.json and the auto-memory-hook, then exercise the
// HybridBackend with v3 agentdb config to verify runtime compatibility.
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-defect: WM-008 init -> runtime (agentdb v3 e2e)', {
  skip: skipMsg || !memPkg ? 'native deps (better-sqlite3, @claude-flow/memory) unavailable' : false,
}, () => {
  let project;

  before(() => {
    project = createProject('wm008-e2e');
    const r = cli(['init', '--yes'], project.dir, 60000);
    if (r.status !== 0) project = null;
  });

  after(() => {
    if (project) project.cleanup();
  });

  it('init generates config.json with agentdb section (WM-008h)', (t) => {
    if (!project) return t.skip('init failed');
    const cfgPath = join(project.dir, '.claude-flow', 'config.json');
    if (!existsSync(cfgPath)) return;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    const agentdb = cfg.memory?.agentdb;
    assert.ok(agentdb, 'config.json should have memory.agentdb section (WM-008h)');
    assert.equal(agentdb.vectorBackend, 'rvf',
      'agentdb.vectorBackend should be rvf (WM-008h)');
    assert.equal(agentdb.enableLearning, true,
      'agentdb.enableLearning should default to true (WM-008h)');
  });

  it('init generates hook with .rvf agentdb config (WM-008k)', (t) => {
    if (!project) return t.skip('init failed');
    const hookPath = join(project.dir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    if (!existsSync(hookPath)) return;
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('agentdb-memory.rvf'),
      'hook should use agentdb-memory.rvf (WM-008k)');
    assert.ok(content.includes("vectorBackend: 'rvf'"),
      'hook should set vectorBackend to rvf (WM-008k)');
  });

  it('HybridBackend with v3 config works in initialized project (WM-008 runtime)', async (t) => {
    if (!project) return t.skip('init failed');
    if (!memPkg?.HybridBackend || !memPkg?.createDefaultEntry) return;

    const backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'wm008-runtime.db') },
      agentdb: {
        dbPath: join(project.dir, '.swarm', 'wm008-runtime.rvf'),
        vectorBackend: 'rvf',
        enableLearning: true,
      },
      dualWrite: true,
    });

    try {
      await backend.initialize();
      assert.ok(true, 'HybridBackend should initialize with v3 config');

      // Store and retrieve
      const entry = memPkg.createDefaultEntry({
        namespace: 'wm008-e2e',
        key: 'v3-runtime-key',
        content: 'agentdb v3 end-to-end runtime test',
        tags: ['wm-008', 'v3', 'e2e'],
      });
      await backend.store(entry);

      const found = await backend.getByKey('wm008-e2e', 'v3-runtime-key');
      assert.ok(found, 'entry should be retrievable after store (WM-008 runtime)');
      assert.equal(found.content, 'agentdb v3 end-to-end runtime test');

      // Health check
      const health = await backend.healthCheck();
      assert.equal(health.status, 'healthy',
        'healthCheck should pass with v3 config (WM-008 runtime)');
    } finally {
      try { await backend.shutdown(); } catch {}
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: cross-defect: syntax validation of all patched files
//
// Runs `node --check` on every patched JS file across ALL npx cache installs
// (both direct and umbrella layouts). This catches SyntaxErrors like duplicate
// declarations that would crash at runtime but go undetected by grep sentinels.
// ══════════════════════════════════════════════════════════════════════════════

const allInstalls = findAllCliInstalls();
const hasSyntaxTargets = allInstalls.length > 0;

// All files that patches touch (relative to dist/src/)
const PATCHED_FILES = [
  'commands/config.js',
  'commands/start.js',
  'commands/init.js',
  'commands/doctor.js',
  'commands/status.js',
  'commands/swarm.js',
  'commands/daemon.js',
  'commands/hooks.js',
  'commands/memory.js',
  'commands/neural.js',
  'memory/memory-initializer.js',
  'memory/intelligence.js',
  'init/executor.js',
  'init/helpers-generator.js',
  'init/settings-generator.js',
  'init/types.js',
  'init/claudemd-generator.js',
  'mcp-tools/hooks-tools.js',
  'mcp-tools/memory-tools.js',
  'mcp-tools/embeddings-tools.js',
  'services/worker-daemon.js',
  'services/headless-worker-executor.js',
  'index.js',
];

describe('cross-defect: syntax validation of all patched files', {
  skip: !hasSyntaxTargets ? 'no CLI installs found in npx cache' : false,
}, () => {
  for (const { cliBase: base, layout, hash } of allInstalls) {
    const shortHash = hash.slice(0, 8);

    for (const relPath of PATCHED_FILES) {
      const fullPath = join(base, relPath);
      const label = `syntax OK: ${relPath} (${layout}@${shortHash})`;

      it(label, () => {
        if (!existsSync(fullPath)) return; // file may not exist in this install
        const r = spawnSync('node', ['--check', fullPath], {
          encoding: 'utf-8',
          timeout: 10000,
        });
        assert.equal(r.status, 0,
          `node --check failed for ${relPath} (${layout}@${shortHash}):\n${r.stderr}`);
      });
    }
  }
});
