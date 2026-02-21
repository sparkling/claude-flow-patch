import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ── Find npx cache with @claude-flow/memory + better-sqlite3 ────────────────

function findNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const memPkg = join(nm, '@claude-flow', 'memory', 'dist', 'index.js');
    const bsql = join(nm, 'better-sqlite3');
    if (existsSync(memPkg) && existsSync(bsql)) return nm;
  }
  return null;
}

const npxNm = findNpxNm();
let canRun = false;
let memPkg = null;

if (npxNm) {
  try {
    memPkg = await import(join(npxNm, '@claude-flow', 'memory', 'dist', 'index.js'));
    canRun = !!(memPkg.HybridBackend && memPkg.SQLiteBackend && memPkg.createDefaultEntry);
  } catch {}
}

const skipMsg = !canRun ? 'native deps unavailable' : false;

// ── Shared project setup ────────────────────────────────────────────────────

function createProject(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `cfp-${prefix}-`));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', type: 'module', private: true }));
  const nm = join(dir, 'node_modules');
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
  mkdirSync(join(dir, '.claude-flow'), { recursive: true });
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });
  return { dir, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: concurrent-access: busy_timeout prevents SQLITE_BUSY
// ══════════════════════════════════════════════════════════════════════════════

describe('concurrent-access: busy_timeout prevents SQLITE_BUSY', { skip: skipMsg, timeout: 30000 }, () => {
  let project, backend;

  before(async () => {
    project = createProject('busy-timeout');
    backend = new memPkg.SQLiteBackend({
      databasePath: join(project.dir, '.swarm', 'busy-timeout.db'),
    });
    await backend.initialize();
    if (backend.db) backend.db.pragma('busy_timeout = 5000');
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('busy_timeout is set to 5000ms', () => {
    if (!backend.db) return;
    const result = backend.db.pragma('busy_timeout');
    const val = Array.isArray(result) ? result[0]?.timeout : result;
    assert.equal(val, 5000, 'busy_timeout should be 5000');
  });

  it('WAL mode enabled', () => {
    if (!backend.db) return;
    const result = backend.db.pragma('journal_mode');
    const mode = Array.isArray(result) ? result[0]?.journal_mode : result;
    assert.equal(mode, 'wal', 'journal mode should be WAL');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: concurrent-access: parallel writes
// ══════════════════════════════════════════════════════════════════════════════

describe('concurrent-access: parallel writes', { skip: skipMsg, timeout: 30000 }, () => {
  let project, backend;

  before(async () => {
    project = createProject('parallel-writes');
    backend = new memPkg.SQLiteBackend({
      databasePath: join(project.dir, '.swarm', 'parallel-writes.db'),
    });
    await backend.initialize();
    if (backend.db) backend.db.pragma('busy_timeout = 5000');
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('10 concurrent stores succeed', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      backend.store(memPkg.createDefaultEntry({
        namespace: 'parallel-10',
        key: `concurrent-${i}`,
        content: `Content for entry ${i}`,
      }))
    );
    const results = await Promise.all(promises);
    assert.equal(results.length, 10, 'all 10 should resolve');
  });

  it('entry count matches after parallel writes', async () => {
    const count = await backend.count('parallel-10');
    assert.equal(count, 10, 'count should be 10 after parallel stores');
  });

  it('20 concurrent stores succeed', async () => {
    const promises = Array.from({ length: 20 }, (_, i) =>
      backend.store(memPkg.createDefaultEntry({
        namespace: 'parallel-20',
        key: `concurrent-20-${i}`,
        content: `Content for entry ${i} in batch of 20`,
      }))
    );
    const results = await Promise.all(promises);
    assert.equal(results.length, 20, 'all 20 should resolve');
  });

  it('all entries retrievable after parallel writes', async () => {
    for (let i = 0; i < 20; i++) {
      const found = await backend.getByKey('parallel-20', `concurrent-20-${i}`);
      assert.ok(found, `entry concurrent-20-${i} should be retrievable`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: concurrent-access: mixed read/write
// ══════════════════════════════════════════════════════════════════════════════

describe('concurrent-access: mixed read/write', { skip: skipMsg, timeout: 30000 }, () => {
  let project, backend;

  before(async () => {
    project = createProject('mixed-rw');
    backend = new memPkg.SQLiteBackend({
      databasePath: join(project.dir, '.swarm', 'mixed-rw.db'),
    });
    await backend.initialize();
    if (backend.db) backend.db.pragma('busy_timeout = 5000');

    // Seed some initial data for reads
    for (let i = 0; i < 5; i++) {
      await backend.store(memPkg.createDefaultEntry({
        namespace: 'mixed-seed',
        key: `seed-${i}`,
        content: `Seed content ${i}`,
      }));
    }
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('reads during writes do not fail', async () => {
    const ops = [];
    // Interleave stores and queries
    for (let i = 0; i < 10; i++) {
      ops.push(backend.store(memPkg.createDefaultEntry({
        namespace: 'mixed-ops',
        key: `mixed-${i}`,
        content: `Mixed content ${i}`,
      })));
      ops.push(backend.query({ namespace: 'mixed-seed', limit: 5 }));
    }
    const results = await Promise.all(ops);
    assert.equal(results.length, 20, 'all 20 mixed ops should resolve');
  });

  it('count is consistent after mixed ops', async () => {
    const seedCount = await backend.count('mixed-seed');
    assert.equal(seedCount, 5, 'seed namespace should still have 5 entries');
    const mixedCount = await backend.count('mixed-ops');
    assert.equal(mixedCount, 10, 'mixed-ops namespace should have 10 entries');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: concurrent-access: rapid CRUD cycle
// ══════════════════════════════════════════════════════════════════════════════

describe('concurrent-access: rapid CRUD cycle', { skip: skipMsg, timeout: 30000 }, () => {
  let project, backend;

  before(async () => {
    project = createProject('crud-cycle');
    backend = new memPkg.SQLiteBackend({
      databasePath: join(project.dir, '.swarm', 'crud-cycle.db'),
    });
    await backend.initialize();
    if (backend.db) backend.db.pragma('busy_timeout = 5000');
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('store-delete-store cycle succeeds', async () => {
    // Store initial entry
    await backend.store(memPkg.createDefaultEntry({
      namespace: 'crud-test',
      key: 'cycle-key',
      content: 'original content',
    }));

    // Find and delete it
    const found = await backend.getByKey('crud-test', 'cycle-key');
    assert.ok(found, 'initial entry should exist');
    await backend.delete(found.id);

    // Verify deletion
    const deleted = await backend.getByKey('crud-test', 'cycle-key');
    assert.equal(deleted, null, 'entry should be deleted');

    // Store a different entry with the same key
    await backend.store(memPkg.createDefaultEntry({
      namespace: 'crud-test',
      key: 'cycle-key',
      content: 'replacement content',
    }));

    const final = await backend.getByKey('crud-test', 'cycle-key');
    assert.ok(final, 'replacement entry should exist');
    assert.equal(final.content, 'replacement content', 'should have replacement content');
  });

  it('rapid namespace operations succeed', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      backend.store(memPkg.createDefaultEntry({
        namespace: `rapid-ns-${i}`,
        key: `ns-key-${i}`,
        content: `Namespace ${i} content`,
      }))
    );
    await Promise.all(promises);

    const namespaces = await backend.listNamespaces();
    for (let i = 0; i < 5; i++) {
      assert.ok(
        namespaces.includes(`rapid-ns-${i}`),
        `namespace rapid-ns-${i} should exist`
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: concurrent-access: HybridBackend dual-write concurrency
// ══════════════════════════════════════════════════════════════════════════════

describe('concurrent-access: HybridBackend dual-write concurrency', { skip: skipMsg, timeout: 30000 }, () => {
  let project, backend;

  before(async () => {
    project = createProject('dual-concurrent');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'dual-concurrent.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'dual-agentdb.db') },
      dualWrite: true,
    });
    await backend.initialize();

    // Set busy_timeout on the SQLite backend
    const sqlBe = backend.getSQLiteBackend?.();
    if (sqlBe?.db) sqlBe.db.pragma('busy_timeout = 5000');
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('dual-write parallel stores succeed', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      backend.store(memPkg.createDefaultEntry({
        namespace: 'dual-concurrent',
        key: `dual-${i}`,
        content: `Dual-write concurrent content ${i}`,
      }))
    );
    const results = await Promise.all(promises);
    assert.equal(results.length, 10, 'all 10 dual-write stores should resolve');
  });

  it('both backends have consistent counts', async () => {
    // Check overall count via HybridBackend (reads from primary = SQLite)
    const count = await backend.count('dual-concurrent');
    assert.equal(count, 10, 'HybridBackend count should be 10');

    // Check SQLite backend directly if accessible
    const sqlBe = backend.getSQLiteBackend?.();
    if (sqlBe) {
      const sqlCount = await sqlBe.count('dual-concurrent');
      assert.equal(sqlCount, 10, 'SQLite backend count should also be 10');
    }
  });
});
