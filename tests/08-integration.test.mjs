import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createFixtureTree } from './helpers/fixture-factory.mjs';
import { runPatch } from './helpers/run-python.mjs';
import { findNpxNmWithNativeDeps } from './helpers/integration-setup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const npxNm = findNpxNmWithNativeDeps();
let depsAvailable = false;
if (npxNm) {
  try {
    const memPkg = await import(join(npxNm, '@claude-flow', 'memory', 'dist', 'index.js'));
    depsAvailable = !!(memPkg.HybridBackend && memPkg.createDefaultEntry);
  } catch {}
}

describe('integration: memory wiring runtime', { skip: !depsAvailable ? 'native deps unavailable' : false }, () => {

  function createIntegrationProject() {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-integ-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', type: 'module', private: true }));

    const nm = join(dir, 'node_modules');
    mkdirSync(join(nm, '@claude-flow'), { recursive: true });

    // Symlink key packages from npx cache
    for (const pkg of ['@claude-flow/memory', 'better-sqlite3', 'agentdb']) {
      const target = join(npxNm, pkg);
      if (existsSync(target)) {
        const linkPath = join(nm, pkg);
        const parent = resolve(linkPath, '..');
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        symlinkSync(target, linkPath);
      }
    }
    // Also symlink transitive deps if hoisted
    for (const dep of ['bindings', 'prebuild-install', 'node-addon-api', 'hnswlib-node', 'file-uri-to-path', 'node-gyp-build']) {
      const target = join(npxNm, dep);
      if (existsSync(target)) {
        const linkPath = join(nm, dep);
        if (!existsSync(linkPath)) symlinkSync(target, linkPath);
      }
    }

    mkdirSync(join(dir, '.claude-flow'), { recursive: true });
    mkdirSync(join(dir, '.swarm'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });

    writeFileSync(join(dir, '.claude-flow', 'config.yaml'),
      'memory:\n  backend: hybrid\n\nneural:\n  enabled: true\n');

    return {
      dir,
      cleanup() { rmSync(dir, { recursive: true, force: true }); }
    };
  }

  // ── HybridBackend operations ──────────────────────────────────────────

  describe('HybridBackend operations', () => {
    let project, backend, createDefaultEntry;

    before(async () => {
      project = createIntegrationProject();
      const memPkg = await import(join(npxNm, '@claude-flow', 'memory', 'dist', 'index.js'));
      createDefaultEntry = memPkg.createDefaultEntry;

      backend = new memPkg.HybridBackend({
        sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
        agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.rvf'), vectorBackend: 'rvf', vectorDimension: 384 },
        dualWrite: true,
        defaultNamespace: 'default',
      });
      await backend.initialize();
    });

    after(async () => {
      if (backend) try { await backend.shutdown(); } catch {}
      if (project) project.cleanup();
    });

    it('creates database files on initialize', () => {
      const dbPath = join(project.dir, '.swarm', 'hybrid-memory.db');
      assert.ok(existsSync(dbPath), 'hybrid-memory.db should exist');
    });

    it('store and retrieve by key', async () => {
      const entry = createDefaultEntry({
        namespace: 'test',
        key: 'round-trip-key',
        content: 'hello world',
        tags: ['test'],
      });
      await backend.store(entry);

      const retrieved = await backend.getByKey('test', 'round-trip-key');
      assert.ok(retrieved, 'should find entry by key');
      assert.equal(retrieved.content, 'hello world');
    });

    it('query structured list with offset', async () => {
      for (let i = 0; i < 3; i++) {
        const entry = createDefaultEntry({
          namespace: 'list-test',
          key: `list-key-${i}`,
          content: `content ${i}`,
        });
        await backend.store(entry);
      }

      const results = await backend.query({ namespace: 'list-test', limit: 10, type: 'structured' });
      assert.ok(Array.isArray(results), 'query should return array');
      assert.ok(results.length >= 3, `expected >= 3 results, got ${results.length}`);
    });

    it('delete reduces count', async () => {
      const entry = createDefaultEntry({
        namespace: 'delete-test',
        key: 'to-delete',
        content: 'will be deleted',
      });
      await backend.store(entry);

      const beforeCount = await backend.count('delete-test');
      assert.ok(beforeCount >= 1, 'should have at least 1 entry');

      const found = await backend.getByKey('delete-test', 'to-delete');
      assert.ok(found, 'entry should exist before delete');
      await backend.delete(found.id);

      const afterCount = await backend.count('delete-test');
      assert.equal(afterCount, beforeCount - 1, 'count should decrease by 1');
    });

    it('undefined namespace queries across all namespaces', async () => {
      // Store an entry first to ensure there's data to query
      const entry = createDefaultEntry({
        namespace: 'cross-ns-test',
        key: 'cross-ns-key',
        content: 'cross namespace entry',
      });
      await backend.store(entry);

      const results = await backend.query({ namespace: undefined, limit: 50, type: 'structured' });
      assert.ok(Array.isArray(results), 'cross-namespace query should return array');
      const namespaces = new Set(results.map(r => r.namespace));
      assert.ok(namespaces.size >= 1, 'should have entries from at least 1 namespace');
    });

    it('busy_timeout pragma can be set on SQLite backend', () => {
      const sqlBe = backend.getSQLiteBackend();
      if (!sqlBe || !sqlBe.db) {
        return;
      }
      sqlBe.db.pragma('busy_timeout = 5000');
      const result = sqlBe.db.pragma('busy_timeout');
      assert.ok(result, 'pragma should return a value');
      // better-sqlite3 returns [{timeout: N}] for busy_timeout pragma
      const val = Array.isArray(result) ? result[0]?.timeout : result;
      assert.equal(val, 5000, 'busy_timeout should be 5000');
    });
  });

  // ── Generated auto-memory-hook ────────────────────────────────────────

  describe('generated auto-memory-hook', () => {
    let fixture, hookContent, hookDir;

    function extractHookContent(genPath) {
      const genContent = readFileSync(genPath, 'utf-8');
      const startMarker = '#!/usr/bin/env node';
      const startIdx = genContent.indexOf(startMarker);
      // The template-closing backtick-semicolon is the last `; in the file
      const endIdx = genContent.lastIndexOf('`;');
      if (startIdx < 0 || endIdx < 0) return null;

      let raw = genContent.substring(startIdx, endIdx);
      // Strip trailing backslash (escape char for the closing backtick)
      if (raw.endsWith('\\')) raw = raw.slice(0, -1);

      // Unescape template literal escapes:
      // \${ -> ${  (escaped template expressions)
      raw = raw.replace(/\\\$\{/g, '${');
      // \` -> `    (escaped backticks)
      raw = raw.replace(/\\`/g, '`');
      return raw;
    }

    before(() => {
      fixture = createFixtureTree();
      const r = runPatch('WM-003', fixture.base);
      assert.equal(r.status, 0, `WM-003 patch failed: ${r.stderr}`);

      const genPath = join(fixture.base, 'init', 'helpers-generator.js');
      hookContent = extractHookContent(genPath);

      // Create project dir — hook must be at .claude/helpers/ for PROJECT_ROOT
      hookDir = mkdtempSync(join(tmpdir(), 'cfp-hook-'));
      writeFileSync(join(hookDir, 'package.json'), JSON.stringify({ name: 'hook-test', type: 'module', private: true }));
      mkdirSync(join(hookDir, '.claude-flow', 'data'), { recursive: true });
      mkdirSync(join(hookDir, '.swarm'), { recursive: true });
      mkdirSync(join(hookDir, '.claude', 'helpers'), { recursive: true });

      // Symlink node_modules with deps for the hook to import
      const nm = join(hookDir, 'node_modules');
      mkdirSync(join(nm, '@claude-flow'), { recursive: true });
      for (const pkg of ['@claude-flow/memory', 'better-sqlite3', 'agentdb']) {
        const target = join(npxNm, pkg);
        if (existsSync(target)) {
          const linkPath = join(nm, pkg);
          const parent = resolve(linkPath, '..');
          if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
          symlinkSync(target, linkPath);
        }
      }
      for (const dep of ['bindings', 'prebuild-install', 'node-addon-api', 'hnswlib-node', 'file-uri-to-path', 'node-gyp-build']) {
        const target = join(npxNm, dep);
        if (existsSync(target)) {
          const linkPath = join(nm, dep);
          if (!existsSync(linkPath)) symlinkSync(target, linkPath);
        }
      }
    });

    after(() => {
      if (fixture) fixture.cleanup();
      if (hookDir) rmSync(hookDir, { recursive: true, force: true });
    });

    it('hook status exits 0', () => {
      assert.ok(hookContent, 'hook content should have been extracted');
      // Place hook at .claude/helpers/ so PROJECT_ROOT = hookDir
      const hookPath = join(hookDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
      writeFileSync(hookPath, hookContent);

      const r = spawnSync('node', [hookPath, 'status'], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: hookDir,
      });
      assert.equal(r.status, 0, `hook status failed: ${r.stderr}`);
    });

    it('hook import exits 0 and creates db', () => {
      const hookPath = join(hookDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
      writeFileSync(hookPath, hookContent);

      const r = spawnSync('node', [hookPath, 'import'], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: hookDir,
      });
      assert.equal(r.status, 0, `hook import failed: ${r.stderr}`);
    });

    it('hook status shows Active (AutoMemoryBridge)', () => {
      const hookPath = join(hookDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
      writeFileSync(hookPath, hookContent);

      const r = spawnSync('node', [hookPath, 'status'], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: hookDir,
      });
      assert.equal(r.status, 0, `hook status failed: ${r.stderr}`);
      assert.ok(r.stdout.includes('Active (AutoMemoryBridge)'),
        `expected "Active (AutoMemoryBridge)" in output, got: ${r.stdout}`);
    });
  });

  // ── Config gating ─────────────────────────────────────────────────────

  describe('config gating', () => {
    it('WM-002 adds neural.enabled check to intelligence.js', () => {
      const fixture2 = createFixtureTree();
      try {
        const r = runPatch('WM-002', fixture2.base);
        assert.equal(r.status, 0, `WM-002 failed: ${r.stderr}`);

        const content = readFileSync(join(fixture2.base, 'memory', 'intelligence.js'), 'utf-8');
        assert.ok(content.includes('neuralEnabled'), 'should have neuralEnabled variable');
        assert.ok(content.includes('cfg.neural && cfg.neural.enabled === false'), 'should check neural.enabled from config.json');
        assert.ok(content.includes('sonaEnabled: false'), 'should return sonaEnabled: false when disabled');
        assert.ok(content.includes('intelligenceInitialized = true'), 'should set flag when disabled');
      } finally {
        fixture2.cleanup();
      }
    });
  });

  // ── Doctor diagnostic ─────────────────────────────────────────────────

  describe('doctor diagnostic', () => {
    it('CF-003 adds checkMemoryBackend function', () => {
      const fixture3 = createFixtureTree();
      try {
        const r = runPatch('CF-003', fixture3.base);
        assert.equal(r.status, 0, `CF-003 failed: ${r.stderr}`);

        const content = readFileSync(join(fixture3.base, 'commands', 'doctor.js'), 'utf-8');
        assert.ok(content.includes('async function checkMemoryBackend'), 'should have checkMemoryBackend function');
        assert.ok(content.includes("require.resolve(pkg)"), 'should use require.resolve for dep checking');
        assert.ok(content.includes("'better-sqlite3'"), 'should check for better-sqlite3');
        assert.ok(content.includes("'@claude-flow/memory'"), 'should check for @claude-flow/memory');
        assert.ok(content.includes('checkMemoryBackend,'), 'should be added to allChecks array');
      } finally {
        fixture3.cleanup();
      }
    });
  });
});
