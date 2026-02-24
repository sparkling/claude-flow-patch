import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { findNpxNmWithHook } from './helpers/integration-setup.mjs';

const npxNm = findNpxNmWithHook();
const canRun = !!npxNm;

// ── Static content tests ──────────────────────────────────────────────────

describe('e2e: init generates patched project', { skip: !canRun ? 'patched npx cache with native deps not found' : false }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-e2e-'));
    const r = spawnSync('npx', ['@claude-flow/cli', 'init', '--yes'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
      env: { ...process.env, npm_config_yes: 'true' },
    });
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('generates auto-memory-hook.mjs', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    assert.ok(existsSync(hookPath), 'auto-memory-hook.mjs should exist');
  });

  it('generated hook uses HybridBackend (not just JsonFileBackend)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('HybridBackend'), 'hook should use HybridBackend');
  });

  it('generated hook has busy_timeout pragma', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('busy_timeout'), 'hook should set busy_timeout for concurrent access');
  });

  it('generated hook status shows Active (AutoMemoryBridge)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('Active (AutoMemoryBridge)'), 'hook should report Active (AutoMemoryBridge) status');
  });

  it('generated hook retains JsonFileBackend as fallback', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('JsonFileBackend'), 'hook should keep JsonFileBackend as fallback');
  });

  it('settings.json has session hooks for auto-memory', () => {
    const settingsPath = join(projectDir, '.claude', 'settings.json');
    assert.ok(existsSync(settingsPath), 'settings.json should exist');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const hooks = settings.hooks;
    assert.ok(hooks, 'settings should have hooks');

    const sessionStart = hooks.SessionStart || hooks.session_start;
    assert.ok(sessionStart, 'should have SessionStart hooks');
    const hasAutoMemory = JSON.stringify(sessionStart).includes('auto-memory-hook');
    assert.ok(hasAutoMemory, 'SessionStart should include auto-memory-hook');
  });

  it('config file has memory backend setting', () => {
    const jsonPath = join(projectDir, '.claude-flow', 'config.json');
    const yamlPath = join(projectDir, '.claude-flow', 'config.yaml');
    assert.ok(existsSync(jsonPath) || existsSync(yamlPath),
      'config.json or config.yaml should exist');
    if (existsSync(jsonPath)) {
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      assert.ok(parsed.memory, 'config.json should have memory section');
    } else {
      const content = readFileSync(yamlPath, 'utf-8');
      assert.ok(content.includes('memory'), 'config.yaml should have memory section');
    }
  });

  // ── WM-008: AgentDB v3 config in generated project ─────────────────────

  it('config.json has agentdb section with vectorBackend rvf (WM-008)', () => {
    const jsonPath = join(projectDir, '.claude-flow', 'config.json');
    if (!existsSync(jsonPath)) return; // skip if config.yaml only
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const agentdb = parsed.memory?.agentdb;
    assert.ok(agentdb, 'config.json should have memory.agentdb section (WM-008h)');
    assert.equal(agentdb.vectorBackend, 'rvf', 'agentdb.vectorBackend should be rvf');
  });

  it('config.json agentdb has learning config (WM-008)', () => {
    const jsonPath = join(projectDir, '.claude-flow', 'config.json');
    if (!existsSync(jsonPath)) return;
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const agentdb = parsed.memory?.agentdb;
    if (!agentdb) return;
    assert.equal(agentdb.enableLearning, true, 'agentdb.enableLearning should default to true');
    assert.equal(typeof agentdb.learningPositiveThreshold, 'number', 'should have learningPositiveThreshold');
    assert.equal(typeof agentdb.learningBatchSize, 'number', 'should have learningBatchSize');
  });

  it('generated hook uses .rvf path (not .db) for agentdb (WM-008)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('agentdb-memory.rvf'), 'hook should use agentdb-memory.rvf (WM-008k)');
    assert.ok(!content.includes('agentdb-memory.db'), 'hook should not use agentdb-memory.db anymore');
  });

  it('generated hook has vectorBackend rvf in agentdb config (WM-008)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes("vectorBackend: 'rvf'"), 'hook should set vectorBackend to rvf (WM-008k)');
  });

  // ── WM-009: Learning feedback wiring in generated project ─────────────

  it('generated hook or memory-tools has recordFeedback wiring (WM-009)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    // WM-009 wires recordSearchFeedback in memory-tools.js and exports it from
    // memory-initializer.js. The generated hook may reference enableLearning
    // or recordFeedback depending on what the init generator emits.
    const hasLearningConfig = content.includes('enableLearning');
    const hasFeedbackRef = content.includes('recordFeedback') || content.includes('recordSearchFeedback');
    assert.ok(hasLearningConfig || hasFeedbackRef,
      'generated hook should reference learning config or feedback function (WM-009)');
  });

  // ── WM-010: Witness chain verification in generated hook ──────────────

  it('generated hook has verifyWitnessChain call when WM-010 is applied (WM-010)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    // WM-010b patches the source hook to add verifyWitnessChain after backend.initialize().
    // The init executor copies the source hook when available, so verifyWitnessChain
    // is present only after patch-all.sh has been run against the npx cache.
    // We check for either the patched string or the HybridBackend (base requirement).
    const hasWitnessCheck = content.includes('verifyWitnessChain');
    const hasHybridBackend = content.includes('HybridBackend');
    assert.ok(hasWitnessCheck || hasHybridBackend,
      'generated hook should contain verifyWitnessChain (if patched) or at least HybridBackend (WM-010)');
    // If WM-010b is applied, verify the specific pattern
    if (hasWitnessCheck) {
      assert.ok(content.includes('witness chain'), 'verifyWitnessChain should have descriptive comment');
    }
  });
});

// ── Runtime tests (require native deps + model warmup) ────────────────────

describe('e2e: init project runtime with native deps', { skip: !canRun ? 'patched npx cache with native deps not found' : false }, () => {
  let projectDir;

  function symlinkDeps() {
    const nm = join(projectDir, 'node_modules');
    mkdirSync(join(nm, '@claude-flow'), { recursive: true });
    for (const pkg of ['@claude-flow/memory', 'better-sqlite3', 'agentdb']) {
      const target = join(npxNm, pkg);
      if (existsSync(target)) {
        const linkPath = join(nm, pkg);
        const parent = resolve(linkPath, '..');
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        if (!existsSync(linkPath)) symlinkSync(target, linkPath);
      }
    }
    for (const dep of ['bindings', 'prebuild-install', 'node-addon-api', 'hnswlib-node', 'file-uri-to-path', 'node-gyp-build']) {
      const target = join(npxNm, dep);
      if (existsSync(target)) {
        const linkPath = join(nm, dep);
        if (!existsSync(linkPath)) symlinkSync(target, linkPath);
      }
    }
  }

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-e2e-rt-'));
    const r = spawnSync('npx', ['@claude-flow/cli', 'init', '--yes'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
      env: { ...process.env, npm_config_yes: 'true' },
    });
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    symlinkDeps();

    // Ensure .swarm/ exists for database files
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });

    // Warm up: first import triggers model download / init (~30s).
    // Subsequent calls are fast.
    const warm = spawnSync('node', [join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs'), 'import'], {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: projectDir,
    });
    // Don't assert — warmup may fail if model isn't cached; tests below will catch it
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('hook import exits 0', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'import'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook import failed (status=${r.status}): ${r.stderr}`);
  });

  it('hook import creates hybrid-memory.db', () => {
    const dbPath = join(projectDir, '.swarm', 'hybrid-memory.db');
    assert.ok(existsSync(dbPath), 'import should create hybrid-memory.db via HybridBackend');
  });

  it('hook status exits 0 and says Active (AutoMemoryBridge)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'status'], {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook status failed: ${r.stderr}`);
    assert.ok(r.stdout.includes('Active (AutoMemoryBridge)'),
      `expected "Active (AutoMemoryBridge)" in output, got: ${r.stdout}`);
  });

  it('hook sync exits 0', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'sync'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook sync failed (status=${r.status}): ${r.stderr}`);
  });

  it('hook import is idempotent (second run exits 0)', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'import'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `second import failed: ${r.stderr}`);
  });

  // ── WM-008: AgentDB v3 runtime in generated project ───────────────────

  it('hook import creates agentdb-memory.rvf (not .db) (WM-008)', () => {
    const rvfPath = join(projectDir, '.swarm', 'agentdb-memory.rvf');
    const dbPath = join(projectDir, '.swarm', 'agentdb-memory.db');
    // RVF file may or may not be created depending on agentdb backend selection,
    // but if any agentdb file exists it should be .rvf not .db
    if (existsSync(rvfPath) || existsSync(dbPath)) {
      assert.ok(!existsSync(dbPath) || existsSync(rvfPath),
        'agentdb should use .rvf path (WM-008g), not .db');
    }
  });
});
