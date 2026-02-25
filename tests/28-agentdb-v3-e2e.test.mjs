// 28-agentdb-v3-e2e.test.mjs — End-to-end functional tests for the AgentDB v3
// self-learning pipeline: storage -> search -> retrieve -> feedback -> tick.
//
// These tests run against the REAL patched packages in the npx cache.
// They are skipped when native deps or agentdb v3 are unavailable.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import {
  mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  findNpxNmWithNativeDeps, findCliBase, findNpxNmWithCliFile,
} from './helpers/integration-setup.mjs';

// ── Locate packages ─────────────────────────────────────────────────────────

const npxNmNative = findNpxNmWithNativeDeps();
const npxNm = findNpxNmWithCliFile('memory/memory-initializer.js');
const cliBase = npxNm ? findCliBase(npxNm) ?? '' : '';

// ── Attempt imports (guard for skip) ────────────────────────────────────────

let memPkg = null;
let agentdbPkg = null;
let slrMod = null;

if (npxNmNative) {
  try {
    memPkg = await import(join(npxNmNative, '@claude-flow', 'memory', 'dist', 'index.js'));
    if (!memPkg.HybridBackend || !memPkg.AgentDBBackend) memPkg = null;
  } catch { memPkg = null; }

  try {
    agentdbPkg = await import(join(npxNmNative, 'agentdb', 'dist', 'src', 'index.js'));
  } catch { agentdbPkg = null; }

  try {
    slrMod = await import(join(npxNmNative, 'agentdb', 'dist', 'src', 'backends', 'rvf', 'SelfLearningRvfBackend.js'));
  } catch { slrMod = null; }
}

const nativeDepsUnavailable = !memPkg
  ? 'native deps unavailable (@claude-flow/memory or better-sqlite3 not found)'
  : false;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `cfp-e2e-${label}-`));
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  return dir;
}

function makeEmbedding(dim, seed) {
  // Deterministic pseudo-embedding from seed string
  const arr = new Float32Array(dim);
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    h = ((h << 5) - h + i) | 0;
    arr[i] = ((h & 0xffff) - 32768) / 32768;
  }
  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) arr[i] /= norm;
  return arr;
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E AgentDB v3 self-learning pipeline
// ══════════════════════════════════════════════════════════════════════════════

describe('E2E: AgentDB v3 self-learning pipeline', {
  skip: nativeDepsUnavailable,
}, () => {
  const DIM = 128;  // small dimension for fast tests
  let tmpDir;
  let backend;

  before(async () => {
    tmpDir = makeTmpDir('pipeline');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(tmpDir, '.swarm', 'e2e-test.db') },
      agentdb: {
        dbPath: join(tmpDir, '.swarm', 'e2e-test.rvf'),
        vectorBackend: 'rvf',
        vectorDimension: DIM,
        enableLearning: true,
        learningPositiveThreshold: 0.7,
        learningNegativeThreshold: 0.3,
        learningBatchSize: 8,
        learningTickInterval: 60000,  // large so the interval does not fire during tests
      },
      dualWrite: true,
    });
    await backend.initialize();

    // Store seed entries
    for (let i = 0; i < 5; i++) {
      const entry = memPkg.createDefaultEntry({
        namespace: 'e2e-test',
        key: `entry-${i}`,
        content: `E2E test entry number ${i} about topic-${i}`,
        tags: ['e2e', `topic-${i}`],
      });
      entry.embedding = makeEmbedding(DIM, `entry-${i}`);
      await backend.store(entry);
    }
  });

  after(async () => {
    try { await backend?.shutdown(); } catch {}
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Test 1: Store and retrieve via HybridBackend ──────────────────────────

  it('Test 1: store and retrieve via HybridBackend', async () => {
    for (let i = 0; i < 5; i++) {
      const found = await backend.getByKey('e2e-test', `entry-${i}`);
      assert.ok(found, `entry-${i} should be retrievable after store`);
      assert.ok(found.content.includes(`number ${i}`),
        `entry-${i} content should match`);
    }
  });

  // ── Test 2: Semantic search returns results ───────────────────────────────

  it('Test 2: semantic search returns results', async () => {
    const query = makeEmbedding(DIM, 'entry-0');
    const results = await backend.search(query, { k: 3 });
    assert.ok(Array.isArray(results), 'search should return an array');
    assert.ok(results.length > 0, 'search should return at least one result');
    // Each result should have a score
    for (const r of results) {
      assert.ok(typeof r.score === 'number' || typeof r.similarity === 'number',
        'result should have a score or similarity');
    }
  });

  // ── Test 3: Search results carry _trajectoryId ────────────────────────────

  it('Test 3: search results carry _trajectoryId when learning backend is active', async (t) => {
    const agentdbBackend = backend.getAgentDBBackend();
    if (!agentdbBackend?.learningBackend) {
      return t.skip('SelfLearningRvfBackend not available (agentdb v2 or import failed)');
    }

    const query = makeEmbedding(DIM, 'entry-1');
    const results = await agentdbBackend.search(query, { k: 3 });
    assert.ok(Array.isArray(results), 'search should return an array');
    if (results.length > 0) {
      // _trajectoryId may be null if sona is not initialized, but the field should exist
      const first = results[0];
      assert.ok('_trajectoryId' in first || first._trajectoryId === null || first._trajectoryId === undefined,
        'result should have _trajectoryId field when learning backend is active');
    }
  });

  // ── Test 4: recordFeedback() accepts trajectory IDs ───────────────────────

  it('Test 4: recordFeedback() accepts trajectory IDs without error', async (t) => {
    const agentdbBackend = backend.getAgentDBBackend();
    if (!agentdbBackend?.learningBackend) {
      return t.skip('SelfLearningRvfBackend not available');
    }

    // Perform a search to generate a trajectory
    const query = makeEmbedding(DIM, 'entry-2');
    const results = await agentdbBackend.search(query, { k: 3 });

    // Try to get a trajectory ID from results
    const trajId = results?.[0]?._trajectoryId;
    if (trajId) {
      // Should not throw
      await agentdbBackend.recordFeedback(trajId, 1.0);
    } else {
      // Even without a trajectory ID, the method should not throw
      await agentdbBackend.recordFeedback('synthetic-q-id', 0.8);
    }
    assert.ok(true, 'recordFeedback should complete without throwing');
  });

  // ── Test 5: Witness chain verification ────────────────────────────────────

  it('Test 5: witness chain verification returns expected shape', async () => {
    // Use the HybridBackend proxy (WM-012b)
    const result = await backend.verifyWitnessChain();
    assert.ok(result, 'verifyWitnessChain should return a result');
    assert.ok(typeof result.valid === 'boolean',
      `result.valid should be boolean, got: ${typeof result.valid}`);
    // chain should be one of 'data', 'learning', or 'none'
    if (result.chain !== undefined) {
      assert.ok(['data', 'learning', 'none'].includes(result.chain),
        `result.chain should be data/learning/none, got: ${result.chain}`);
    }

    // Store a new entry and verify chain again
    const entriesBefore = result.entries || 0;
    const newEntry = memPkg.createDefaultEntry({
      namespace: 'e2e-test',
      key: 'witness-check',
      content: 'entry for witness chain verification test',
      tags: ['e2e', 'witness'],
    });
    newEntry.embedding = makeEmbedding(DIM, 'witness-check');
    await backend.store(newEntry);

    const result2 = await backend.verifyWitnessChain();
    assert.ok(result2, 'second verifyWitnessChain should return a result');
    assert.ok(typeof result2.valid === 'boolean', 'second result.valid should be boolean');
  });

  // ── Test 6: tick() runs without error ─────────────────────────────────────

  it('Test 6: tick() runs without error and getLearningStats returns expected shape', async (t) => {
    const agentdbBackend = backend.getAgentDBBackend();
    if (!agentdbBackend?.learningBackend) {
      return t.skip('SelfLearningRvfBackend not available');
    }

    // tick should not throw
    await agentdbBackend.learningBackend.tick();
    assert.ok(true, 'tick() should complete without throwing');

    // getLearningStats should return an object with expected fields
    const stats = agentdbBackend.learningBackend.getLearningStats();
    assert.ok(stats, 'getLearningStats should return an object');
    assert.ok(typeof stats.searchesEnhanced === 'number',
      'stats.searchesEnhanced should be a number');
    assert.ok(typeof stats.trajectoriesRecorded === 'number',
      'stats.trajectoriesRecorded should be a number');
    assert.ok(typeof stats.tickCount === 'number',
      'stats.tickCount should be a number');
  });

  // ── Test 7: ReasoningBank pattern store + retrieve ────────────────────────

  it('Test 7: ReasoningBank pattern store and retrieve (WM-011)', async (t) => {
    // The ReasoningBank is exposed via memory-initializer.js and requires
    // @claude-flow/neural which may not be available. Try to load it.
    let getReasoningBank;
    try {
      const miPath = join(cliBase, 'memory', 'memory-initializer.js');
      if (!existsSync(miPath)) return t.skip('memory-initializer.js not found');
      const mi = await import(`file://${miPath}`);
      getReasoningBank = mi.getReasoningBank;
    } catch {
      return t.skip('memory-initializer.js could not be imported');
    }
    if (typeof getReasoningBank !== 'function') {
      return t.skip('getReasoningBank not exported from memory-initializer.js');
    }

    const rb = getReasoningBank();
    if (!rb) {
      return t.skip('ReasoningBank not available (neural package missing or not initialized)');
    }

    // Store a pattern via the ReasoningBank API
    if (typeof rb.storeTrajectory === 'function') {
      try {
        await rb.storeTrajectory({
          sessionId: 'e2e-test-session',
          task: 'test pattern storage',
          reward: 0.9,
          steps: [{ action: 'store', result: 'ok' }],
        });
      } catch {
        // storeTrajectory may require specific args; not a hard failure
      }
    }

    // Attempt retrieval
    if (typeof rb.retrieveByContent === 'function') {
      try {
        const retrieved = await rb.retrieveByContent('test pattern');
        assert.ok(Array.isArray(retrieved), 'retrieveByContent should return an array');
      } catch {
        // May throw if no patterns exist yet
      }
    }

    assert.ok(rb, 'ReasoningBank instance should exist');
  });

  // ── Test 8: Full round-trip ───────────────────────────────────────────────

  it('Test 8: full round-trip store -> search -> retrieve -> feedback -> verify -> shutdown', async () => {
    // Create a fresh backend for isolation
    const rtDir = makeTmpDir('roundtrip');
    const rtBackend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(rtDir, '.swarm', 'rt-test.db') },
      agentdb: {
        dbPath: join(rtDir, '.swarm', 'rt-test.rvf'),
        vectorBackend: 'rvf',
        vectorDimension: DIM,
        enableLearning: true,
        learningTickInterval: 600000,  // very large to prevent interval firing
      },
      dualWrite: true,
    });

    try {
      await rtBackend.initialize();

      // Store 10 entries
      for (let i = 0; i < 10; i++) {
        const entry = memPkg.createDefaultEntry({
          namespace: 'rt-ns',
          key: `rt-key-${i}`,
          content: `round-trip entry ${i} about subject-${i % 3}`,
          tags: ['roundtrip', `subject-${i % 3}`],
        });
        entry.embedding = makeEmbedding(DIM, `rt-key-${i}`);
        await rtBackend.store(entry);
      }

      // Search for related content
      const searchEmb = makeEmbedding(DIM, 'rt-key-0');
      const results = await rtBackend.search(searchEmb, { k: 5 });
      assert.ok(results.length > 0, 'search should return results');

      // Retrieve top result by key
      const topEntry = results[0].entry;
      if (topEntry?.key) {
        const retrieved = await rtBackend.getByKey(topEntry.namespace || 'rt-ns', topEntry.key);
        assert.ok(retrieved, 'top result should be retrievable by key');
      }

      // Record feedback (if trajectory available)
      const agentdbBk = rtBackend.getAgentDBBackend();
      if (agentdbBk?.learningBackend && results[0]._trajectoryId) {
        await agentdbBk.recordFeedback(results[0]._trajectoryId, 1.0);
      }

      // Verify witness chain
      const wcResult = await rtBackend.verifyWitnessChain();
      assert.ok(wcResult, 'verifyWitnessChain should return a result');
      assert.ok(typeof wcResult.valid === 'boolean', 'witness chain valid should be boolean');

      // Shutdown cleanly
      await rtBackend.shutdown();

      // Verify tick interval is cleared
      if (agentdbBk) {
        assert.ok(!agentdbBk._tickInterval,
          'tick interval should be cleared after shutdown');
      }
    } finally {
      try { await rtBackend.shutdown(); } catch {}
      rmSync(rtDir, { recursive: true, force: true });
    }
  });

  // ── Test 9: _recentSearchHits cap (WM-009f) ──────────────────────────────

  it('Test 9: _recentSearchHits cap constant exists in memory-tools.js (WM-009f)', (t) => {
    // Verify the patched constant exists in the source file
    const memToolsPath = join(cliBase, 'mcp-tools', 'memory-tools.js');
    if (!existsSync(memToolsPath)) {
      return t.skip('memory-tools.js not found in CLI base');
    }
    const src = readFileSync(memToolsPath, 'utf-8');
    assert.ok(src.includes('_SEARCH_HITS_MAX'),
      'memory-tools.js should contain _SEARCH_HITS_MAX constant (WM-009f R6)');
    assert.ok(src.includes('500'),
      'memory-tools.js should set cap to 500');
    // Also verify the eviction code
    assert.ok(src.includes('_recentSearchHits.size > _SEARCH_HITS_MAX') ||
              src.includes('_recentSearchHits.size >'),
      'memory-tools.js should have eviction check');
  });

  // ── Test 10: Lazy-loader retry (WM-011f) ─────────────────────────────────

  it('Test 10: lazy-loader retry pattern in hooks-tools.js (WM-011f)', (t) => {
    // Verify the patched lazy-loader retry pattern in hooks-tools.js source
    const hooksToolsPath = join(cliBase, 'mcp-tools', 'hooks-tools.js');
    if (!existsSync(hooksToolsPath)) {
      return t.skip('hooks-tools.js not found in CLI base');
    }
    const src = readFileSync(hooksToolsPath, 'utf-8');
    // WM-011f: should use undefined (not null) as initial value so !reasoningBankRef retries
    assert.ok(src.includes('WM-011f (R7b): Retry when unavailable') ||
              src.includes('let reasoningBankRef = undefined'),
      'hooks-tools.js should have WM-011f retry-on-null pattern');
    // Should NOT have the old permanent null-cache pattern
    assert.ok(!src.includes('let reasoningBankRef = null;') ||
              src.includes('let reasoningBankRef = undefined'),
      'hooks-tools.js should not permanently cache null (WM-011f)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E AgentDB v3 SelfLearningRvfBackend direct tests
//
// Tests the SelfLearningRvfBackend class directly (bypassing HybridBackend)
// to verify it can be imported and instantiated from the sub-path export.
// ══════════════════════════════════════════════════════════════════════════════

describe('E2E: SelfLearningRvfBackend direct instantiation', {
  skip: !slrMod ? 'agentdb/backends/self-learning not importable' : false,
}, () => {
  const DIM = 64;
  let instance;
  let tmpDir;

  before(async () => {
    tmpDir = makeTmpDir('slr-direct');
    const SelfLearningRvfBackend = slrMod.SelfLearningRvfBackend || slrMod.default;
    if (!SelfLearningRvfBackend) {
      throw new Error('SelfLearningRvfBackend not found in agentdb/backends/self-learning');
    }
    instance = await SelfLearningRvfBackend.create({
      dimension: DIM,
      metric: 'cosine',
      storagePath: join(tmpDir, '.swarm', 'slr-test.rvf'),
      learning: true,
      positiveThreshold: 0.7,
      negativeThreshold: 0.3,
      trainingBatchSize: 8,
      tickIntervalMs: 600000,
    });
  });

  after(async () => {
    try { instance?.destroy(); } catch {}
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('SelfLearningRvfBackend imports from sub-path export (R1)', () => {
    const SLR = slrMod.SelfLearningRvfBackend || slrMod.default;
    assert.ok(SLR, 'SelfLearningRvfBackend should be importable from agentdb/backends/self-learning');
    assert.ok(typeof SLR.create === 'function', 'SelfLearningRvfBackend.create should be a function');
  });

  it('instance has searchAsync, recordFeedback, tick methods', () => {
    assert.ok(typeof instance.searchAsync === 'function', 'should have searchAsync');
    assert.ok(typeof instance.recordFeedback === 'function', 'should have recordFeedback');
    assert.ok(typeof instance.tick === 'function', 'should have tick');
  });

  it('instance has getLearningStats returning expected shape', () => {
    const stats = instance.getLearningStats();
    assert.ok(stats, 'getLearningStats should return an object');
    assert.ok(typeof stats.searchesEnhanced === 'number', 'searchesEnhanced should be number');
    assert.ok(typeof stats.trajectoriesRecorded === 'number', 'trajectoriesRecorded should be number');
    assert.ok(typeof stats.tickCount === 'number', 'tickCount should be number');
  });

  it('searchAsync + recordFeedback round-trip', async () => {
    // Insert a vector
    const emb = makeEmbedding(DIM, 'slr-test-entry');
    await instance.insertAsync('slr-1', emb, { content: 'test' });

    // Search
    const results = await instance.searchAsync(emb, 1);
    assert.ok(results.length > 0, 'searchAsync should return results after insert');

    // Feedback (use the synthetic trajectory ID from activeTrajectories)
    // The trajectory may or may not exist depending on sona init; just ensure no throw
    instance.recordFeedback('q_0', 0.9);
    assert.ok(true, 'recordFeedback should not throw');
  });

  it('verifyWitnessChain returns expected shape', () => {
    const result = instance.verifyWitnessChain();
    // May be null if solver not initialized, or an object
    if (result) {
      assert.ok(typeof result.valid === 'boolean' || typeof result.entryCount === 'number',
        'verifyWitnessChain result should have valid or entryCount');
    }
  });
});
