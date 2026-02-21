import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, readdirSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Find the npx cache node_modules that has both patched CLI and native deps
function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const hookPath = join(nm, '@claude-flow', 'cli', '.claude', 'helpers', 'auto-memory-hook.mjs');
    const memPkg = join(nm, '@claude-flow', 'memory', 'dist', 'index.js');
    const bsql = join(nm, 'better-sqlite3');
    if (existsSync(hookPath) && existsSync(memPkg) && existsSync(bsql)) {
      const content = readFileSync(hookPath, 'utf-8');
      if (content.includes('HybridBackend') && content.includes('busy_timeout')) return nm;
    }
  }
  return null;
}

const npxNm = findPatchedNpxNm();
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

  it('config.yaml has memory backend setting', () => {
    const configPath = join(projectDir, '.claude-flow', 'config.yaml');
    assert.ok(existsSync(configPath), 'config.yaml should exist');
    const content = readFileSync(configPath, 'utf-8');
    assert.ok(content.includes('memory'), 'config should have memory section');
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
});
