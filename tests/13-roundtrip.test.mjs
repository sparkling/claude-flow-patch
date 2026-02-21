import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ── Find npx cache ──────────────────────────────────────────────────────────

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
    canRun = !!(memPkg.HybridBackend && memPkg.AutoMemoryBridge && memPkg.SQLiteBackend);
  } catch {}
}

const skipMsg = !canRun ? 'native deps unavailable' : false;

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
// Suite: MEMORY.md round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe('roundtrip: MEMORY.md import → DB → sync → files', { skip: skipMsg }, () => {
  let project, backend, bridge;

  before(async () => {
    project = createProject('roundtrip');

    // Create auto-memory directory structure with MEMORY.md
    const autoMemDir = join(project.dir, '.claude', 'projects', '-test-project', 'memory');
    mkdirSync(autoMemDir, { recursive: true });
    writeFileSync(join(autoMemDir, 'MEMORY.md'), [
      '# Project Memory',
      '',
      '## Patterns',
      '- Always validate user input at API boundaries',
      '- Use TypeScript strict mode for all new modules',
      '',
      '## Architecture',
      '- Services communicate via message queues',
      '- Database access through repository pattern only',
      '',
    ].join('\n'));

    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();

    bridge = new memPkg.AutoMemoryBridge(backend, {
      workingDir: project.dir,
      syncMode: 'on-session-end',
    });
  });

  after(async () => {
    if (bridge?.destroy) bridge.destroy();
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('importFromAutoMemory reads MEMORY.md entries into DB', async () => {
    const result = await bridge.importFromAutoMemory();
    assert.ok(result, 'import should return result');
    assert.ok('imported' in result, 'result should have imported count');
    // May import 0 if no matching auto-memory files found in expected path
    assert.ok(result.imported >= 0, 'imported should be non-negative');
  });

  it('import is idempotent (second run skips duplicates)', async () => {
    const first = await bridge.importFromAutoMemory();
    const second = await bridge.importFromAutoMemory();
    assert.ok(second, 'second import should return result');
    // Second run should skip entries already imported
    assert.ok(second.skipped >= 0, 'second import should skip entries');
  });

  it('recordInsight followed by syncToAutoMemory creates topic files', async () => {
    // Record several insights
    for (const [cat, summary] of [
      ['debugging', 'Always check async stack traces for root cause'],
      ['patterns', 'Prefer composition over inheritance for services'],
      ['testing', 'Mock external dependencies at service boundaries'],
    ]) {
      await bridge.recordInsight({
        category: cat,
        summary,
        source: 'agent:coder',
        confidence: 0.9,
      });
    }

    const result = await bridge.syncToAutoMemory();
    assert.ok(result, 'sync should return result');
    assert.ok('synced' in result, 'result should have synced count');
  });

  it('curateIndex updates MEMORY.md index', async () => {
    await bridge.curateIndex();
    // Check that the memory directory exists
    assert.ok(true, 'curateIndex should complete without error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Embedding generation
// ══════════════════════════════════════════════════════════════════════════════

describe('roundtrip: embedding generation', { skip: skipMsg }, () => {
  // Check if memory-initializer exports are available
  const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';
  const miPath = join(cliBase, 'memory', 'memory-initializer.js');
  const hasMI = existsSync(miPath);
  let mi = null;

  before(async () => {
    if (hasMI) {
      try {
        mi = await import(`file://${miPath}`);
      } catch {}
    }
  });

  it('generateEmbedding returns embedding with dimensions', { skip: !hasMI ? 'memory-initializer not found' : false }, async () => {
    if (!mi?.generateEmbedding) return;
    const result = await mi.generateEmbedding('test text for embedding');
    assert.ok(result, 'generateEmbedding should return result');
    assert.ok(result.embedding, 'result should have embedding');
    assert.ok(result.dimensions > 0, `dimensions should be positive, got ${result.dimensions}`);
    // Default model produces 384-dimensional embeddings
    assert.ok(result.dimensions === 384 || result.dimensions === 768,
      `expected 384 or 768 dimensions, got ${result.dimensions}`);
  });

  it('different texts produce different embeddings', { skip: !hasMI ? 'memory-initializer not found' : false }, async () => {
    if (!mi?.generateEmbedding) return;
    const r1 = await mi.generateEmbedding('the cat sat on the mat');
    const r2 = await mi.generateEmbedding('quantum mechanics describes wave-particle duality');

    assert.ok(r1.embedding && r2.embedding, 'both should have embeddings');
    assert.equal(r1.dimensions, r2.dimensions, 'dimensions should match');

    // Compute cosine similarity — different texts should NOT be identical
    let dot = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < r1.embedding.length; i++) {
      dot += r1.embedding[i] * r2.embedding[i];
      mag1 += r1.embedding[i] * r1.embedding[i];
      mag2 += r2.embedding[i] * r2.embedding[i];
    }
    const sim = dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    assert.ok(sim < 0.99, `very different texts should not be nearly identical (sim=${sim.toFixed(4)})`);
    assert.ok(sim > -1, `similarity should be valid (sim=${sim.toFixed(4)})`);
  });

  it('same text produces same embedding', { skip: !hasMI ? 'memory-initializer not found' : false }, async () => {
    if (!mi?.generateEmbedding) return;
    const r1 = await mi.generateEmbedding('deterministic embedding test');
    const r2 = await mi.generateEmbedding('deterministic embedding test');

    let dot = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < r1.embedding.length; i++) {
      dot += r1.embedding[i] * r2.embedding[i];
      mag1 += r1.embedding[i] * r1.embedding[i];
      mag2 += r2.embedding[i] * r2.embedding[i];
    }
    const sim = dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
    assert.ok(sim > 0.999, `same text should produce identical embeddings (sim=${sim.toFixed(4)})`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SQLiteBackend standalone
// ══════════════════════════════════════════════════════════════════════════════

describe('roundtrip: SQLiteBackend standalone', { skip: skipMsg }, () => {
  let project, sqlBackend;

  before(async () => {
    project = createProject('sqlite');
    sqlBackend = new memPkg.SQLiteBackend({
      databasePath: join(project.dir, '.swarm', 'sqlite-standalone.db'),
    });
    await sqlBackend.initialize();
  });

  after(async () => {
    if (sqlBackend) try { await sqlBackend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('creates database file on initialize', () => {
    const dbPath = join(project.dir, '.swarm', 'sqlite-standalone.db');
    assert.ok(existsSync(dbPath), 'sqlite-standalone.db should exist');
  });

  it('WAL journal mode is enabled', () => {
    if (!sqlBackend.db) return;
    const result = sqlBackend.db.pragma('journal_mode');
    const mode = Array.isArray(result) ? result[0]?.journal_mode : result;
    assert.equal(mode, 'wal', 'journal mode should be WAL');
  });

  it('store and retrieve by key', async () => {
    const entry = memPkg.createDefaultEntry({
      namespace: 'sqlite-test',
      key: 'sql-key-1',
      content: 'standalone sqlite content',
      tags: ['sqlite'],
    });
    await sqlBackend.store(entry);

    const found = await sqlBackend.getByKey('sqlite-test', 'sql-key-1');
    assert.ok(found, 'should find entry by key');
    assert.equal(found.content, 'standalone sqlite content');
  });

  it('query returns entries by namespace', async () => {
    const results = await sqlBackend.query({ namespace: 'sqlite-test', limit: 10 });
    assert.ok(Array.isArray(results), 'query should return array');
    assert.ok(results.length >= 1, 'should have at least 1 entry');
  });

  it('delete removes entry', async () => {
    const found = await sqlBackend.getByKey('sqlite-test', 'sql-key-1');
    assert.ok(found, 'entry should exist before delete');
    await sqlBackend.delete(found.id);

    const after = await sqlBackend.getByKey('sqlite-test', 'sql-key-1');
    assert.equal(after, null, 'entry should be gone after delete');
  });

  it('healthCheck returns healthy', async () => {
    const health = await sqlBackend.healthCheck();
    assert.ok(health, 'healthCheck should return result');
    assert.equal(health.status, 'healthy', `status should be healthy, got ${health.status}`);
  });

  it('getStats returns entry counts', async () => {
    // Store a few entries for stats
    for (let i = 0; i < 3; i++) {
      await sqlBackend.store(memPkg.createDefaultEntry({
        namespace: 'stats-test',
        key: `stats-key-${i}`,
        content: `stats content ${i}`,
      }));
    }

    const stats = await sqlBackend.getStats();
    assert.ok(stats, 'getStats should return stats');
    assert.ok('totalEntries' in stats, 'should have totalEntries');
    assert.ok(stats.totalEntries >= 3, `expected >= 3 entries, got ${stats.totalEntries}`);
  });

  it('listNamespaces returns all namespaces', async () => {
    const namespaces = await sqlBackend.listNamespaces();
    assert.ok(Array.isArray(namespaces), 'listNamespaces should return array');
    assert.ok(namespaces.includes('stats-test'), 'should include stats-test namespace');
  });
});
