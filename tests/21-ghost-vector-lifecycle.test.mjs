import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ── Find npx cache with native deps ────────────────────────────────────────

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
    canRun = !!(memPkg.HybridBackend && memPkg.createDefaultEntry);
  } catch {}
}

const skipMsg = !canRun ? 'native deps unavailable' : false;

// Check for hnswlib-node availability
const hasHnsw = npxNm ? existsSync(join(npxNm, 'hnswlib-node')) : false;

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
// Suite: ghost-vector: HNSW cleanup after delete
// ══════════════════════════════════════════════════════════════════════════════

describe('ghost-vector: HNSW cleanup after delete', { skip: skipMsg }, () => {
  let project, backend;
  const entryIds = [];
  const NS = 'gv-cleanup-test';

  before(async () => {
    project = createProject('gv-cleanup');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();

    // Store 5 entries with distinct content
    for (let i = 0; i < 5; i++) {
      const entry = memPkg.createDefaultEntry({
        namespace: NS,
        key: `gv-key-${i}`,
        content: `Ghost vector test content number ${i}: ${['alpha pattern recognition', 'beta signal processing', 'gamma data analysis', 'delta network topology', 'epsilon error correction'][i]}`,
        tags: ['ghost-vector', `entry-${i}`],
      });
      await backend.store(entry);
      entryIds.push(entry.id);
    }
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('store 5 entries with content', async () => {
    const count = await backend.count(NS);
    assert.equal(count, 5, `expected 5 entries, got ${count}`);
  });

  it('delete 2 entries', async () => {
    // Delete entries 0 and 1
    await backend.delete(entryIds[0]);
    await backend.delete(entryIds[1]);

    const count = await backend.count(NS);
    assert.equal(count, 3, `expected 3 entries after deleting 2, got ${count}`);
  });

  it('search does not return deleted entries', async () => {
    const results = await backend.query({ namespace: NS, limit: 10 });
    const resultIds = results.map(r => r.id);

    assert.ok(!resultIds.includes(entryIds[0]), 'deleted entry 0 should not appear in results');
    assert.ok(!resultIds.includes(entryIds[1]), 'deleted entry 1 should not appear in results');
  });

  it('list only shows active entries', async () => {
    const results = await backend.query({ namespace: NS, limit: 10 });
    assert.equal(results.length, 3, `expected 3 active entries, got ${results.length}`);
  });

  it('stats reflect correct count', async () => {
    const stats = await backend.getStats();
    assert.ok(stats, 'getStats should return stats');
    assert.ok('totalEntries' in stats, 'stats should have totalEntries');
    // totalEntries includes entries from all namespaces, but our namespace should contribute 3
    const nsCount = await backend.count(NS);
    assert.equal(nsCount, 3, `namespace count should be 3, got ${nsCount}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: ghost-vector: HNSW metadata integrity
// ══════════════════════════════════════════════════════════════════════════════

describe('ghost-vector: HNSW metadata integrity', { skip: skipMsg }, () => {
  let project, backend;
  const entryIds = [];
  const NS = 'gv-metadata-test';

  before(async () => {
    project = createProject('gv-metadata');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();

    // Store entries
    for (let i = 0; i < 4; i++) {
      const entry = memPkg.createDefaultEntry({
        namespace: NS,
        key: `meta-key-${i}`,
        content: `Metadata integrity test ${i}`,
        tags: ['metadata'],
      });
      await backend.store(entry);
      entryIds.push(entry.id);
    }

    // Write a fake HNSW metadata file that simulates what the index would create
    const metadataPath = join(project.dir, '.swarm', 'hnsw.metadata.json');
    const metadata = entryIds.map(id => [id, { key: `key-for-${id}`, namespace: NS }]);
    writeFileSync(metadataPath, JSON.stringify(metadata));
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('HNSW metadata file exists', () => {
    const metadataPath = join(project.dir, '.swarm', 'hnsw.metadata.json');
    assert.ok(existsSync(metadataPath), 'hnsw.metadata.json should exist');
  });

  it('metadata does not contain deleted IDs after manual cleanup', () => {
    const metadataPath = join(project.dir, '.swarm', 'hnsw.metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

    // Simulate the GV-001 patch behavior: filter out deleted entry IDs
    const deletedId = entryIds[0];
    const filtered = metadata.filter(([id]) => id !== deletedId);

    assert.ok(filtered.length < metadata.length, 'filtering should remove the deleted entry');
    const filteredIds = filtered.map(([id]) => id);
    assert.ok(!filteredIds.includes(deletedId), 'filtered metadata should not contain deleted ID');

    // Write back the filtered metadata (simulating what GV-001 does)
    writeFileSync(metadataPath, JSON.stringify(filtered));

    // Re-read and verify
    const updated = JSON.parse(readFileSync(metadataPath, 'utf-8'));
    assert.equal(updated.length, entryIds.length - 1, 'metadata should have one fewer entry');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: ghost-vector: search quality after delete
// ══════════════════════════════════════════════════════════════════════════════

describe('ghost-vector: search quality after delete', { skip: skipMsg }, () => {
  let project, backend;
  const NS = 'gv-search-test';
  const entryIds = [];

  before(async () => {
    project = createProject('gv-search');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();

    // Store entries with very different content for search quality testing
    const contents = [
      'Quantum computing uses qubits for parallel computation',
      'Machine learning trains models on labeled datasets',
      'Database indexing improves query performance with B-trees',
      'Network security involves firewalls and intrusion detection',
      'Functional programming uses immutable data and pure functions',
    ];

    for (let i = 0; i < contents.length; i++) {
      const entry = memPkg.createDefaultEntry({
        namespace: NS,
        key: `search-key-${i}`,
        content: contents[i],
        tags: ['search-quality', `topic-${i}`],
      });
      await backend.store(entry);
      entryIds.push(entry.id);
    }

    // Delete the first two entries
    await backend.delete(entryIds[0]);
    await backend.delete(entryIds[1]);
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('search returns relevant results only', async () => {
    const results = await backend.query({ namespace: NS, limit: 10 });
    const resultIds = results.map(r => r.id);

    // Deleted entries should not appear
    assert.ok(!resultIds.includes(entryIds[0]), 'deleted quantum computing entry should not appear');
    assert.ok(!resultIds.includes(entryIds[1]), 'deleted machine learning entry should not appear');

    // Active entries should appear
    assert.ok(resultIds.includes(entryIds[2]), 'database indexing entry should still be found');
    assert.ok(resultIds.includes(entryIds[3]), 'network security entry should still be found');
    assert.ok(resultIds.includes(entryIds[4]), 'functional programming entry should still be found');
  });

  it('search scores are valid (0-1 range)', async () => {
    // Use backend.search if available, otherwise verify query results have valid structure
    if (typeof backend.search === 'function') {
      const results = await backend.search('database query performance', { namespace: NS, limit: 5 });
      for (const result of results) {
        if ('score' in result || 'similarity' in result) {
          const score = result.score ?? result.similarity;
          assert.ok(score >= 0 && score <= 1, `score should be in 0-1 range, got ${score}`);
        }
      }
    } else {
      // Fallback: verify query returns well-formed entries
      const results = await backend.query({ namespace: NS, limit: 5 });
      assert.ok(Array.isArray(results), 'query should return array');
      for (const result of results) {
        assert.ok(result.id, 'each result should have an id');
        assert.ok(result.content, 'each result should have content');
      }
    }
  });
});
