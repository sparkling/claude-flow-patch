import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findNpxNmWithCliFile, findCliBase } from './helpers/integration-setup.mjs';

// ── Find patched npx cache ──────────────────────────────────────────────────

const npxNm = findNpxNmWithCliFile('memory/memory-initializer.js');
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? findCliBase(npxNm) ?? '' : '';

// ── Find ruvector package ───────────────────────────────────────────────────

let ruvectorCliPath = null;
if (npxNm) {
  const rvPath = join(npxNm, 'ruvector', 'bin', 'cli.js');
  if (existsSync(rvPath)) ruvectorCliPath = rvPath;
}
const noRuvector = !ruvectorCliPath ? 'ruvector package not found' : false;

// ── Read files once for reuse ───────────────────────────────────────────────

let miContent = '';
let executorContent = '';
let rvContent = '';

if (canRun) {
  miContent = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8');
  const executorPath = join(cliBase, 'init', 'executor.js');
  if (existsSync(executorPath)) {
    executorContent = readFileSync(executorPath, 'utf-8');
  }
}
if (ruvectorCliPath) {
  rvContent = readFileSync(ruvectorCliPath, 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: EM-001 — Config-driven embedding model + HNSW dims
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: EM-001 config-driven embedding model', { skip: skipMsg }, () => {
  it('EM-001a: reads model from embeddings.json', () => {
    assert.ok(miContent.includes('embeddings.json'),
      'memory-initializer.js should reference embeddings.json config file');
  });

  it('EM-001b: reads dimensions from config (not hardcoded 384)', () => {
    assert.ok(miContent.includes('embConfig.dimension'),
      'memory-initializer.js should read dimension from config');
  });

  it('EM-001c: deletes stale HNSW on forceRebuild', () => {
    assert.ok(miContent.includes('forceRebuild'),
      'memory-initializer.js should handle forceRebuild');
  });

  it('EM-001d: guards metadata loading with forceRebuild check', () => {
    assert.ok(miContent.includes('!options?.forceRebuild && fs.existsSync(metadataPath)'),
      'memory-initializer.js should guard metadata loading behind forceRebuild');
  });

  it('EM-001e: default dimension is 768', () => {
    assert.ok(miContent.includes('768'),
      'memory-initializer.js should use 768 as default dimension');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: EM-002 — @xenova/transformers cache permissions
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: EM-002 transformers cache permissions', { skip: skipMsg }, () => {
  it('EM-002: fix.sh exists for cache permissions', () => {
    const fixSh = join(process.cwd(), 'patch', '090-EM-002-transformers-cache-eacces', 'fix.sh');
    assert.ok(existsSync(fixSh),
      'EM-002 fix.sh should exist in patch directory');
    const fixContent = readFileSync(fixSh, 'utf-8');
    assert.ok(fixContent.includes('TRANSFORMERS'),
      'fix.sh should reference TRANSFORMERS cache directory');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: GV-001 — HNSW ghost vector cleanup
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: GV-001 HNSW ghost vector cleanup', { skip: skipMsg }, () => {
  it('GV-001a: removes from HNSW metadata on delete', () => {
    assert.ok(miContent.includes('hnsw.metadata.json'),
      'memory-initializer.js should reference hnsw.metadata.json for cleanup');
    assert.ok(miContent.includes('metadata.filter'),
      'memory-initializer.js should filter metadata entries on delete');
  });

  it('GV-001b: clears in-memory index entry on delete', () => {
    assert.ok(miContent.includes('hnswIndex.entries.delete'),
      'memory-initializer.js should delete entry from in-memory hnswIndex');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: IN-001 — Real intelligence.cjs (not stub)
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: IN-001 real intelligence.cjs', { skip: skipMsg }, () => {
  it('IN-001a: upgrade path tries reading real intelligence.cjs', () => {
    assert.ok(executorContent.includes('intelligenceContent'),
      'executor.js should have intelligenceContent variable for real file attempt');
  });

  it('IN-001b: writeHelpers path tries reading real intelligence.cjs', () => {
    assert.ok(executorContent.includes('intelligenceForInit'),
      'executor.js should have intelligenceForInit variable for fresh-init fallback');
  });

  it('IN-001c: resolves path to package helpers directory', () => {
    assert.ok(executorContent.includes("'intelligence.cjs'"),
      'executor.js should reference intelligence.cjs file');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-001 — force-learn calls engine.tick()
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: RV-001 force-learn engine.tick()', { skip: skipMsg || noRuvector }, () => {
  it('RV-001a: force-learn uses full Intelligence (no skipEngine)', () => {
    assert.ok(rvContent.includes('Need engine for tick()'),
      'ruvector cli.js force-learn should initialize Intelligence without skipEngine');
  });

  it('RV-001b: calls engine.tick() instead of intel.tick()', () => {
    assert.ok(rvContent.includes('eng.tick()'),
      'ruvector cli.js should call eng.tick() for force-learn');
  });

  it('RV-001c: handles no-engine case gracefully', () => {
    assert.ok(rvContent.includes('Engine not available'),
      'ruvector cli.js should have fallback message when engine is unavailable');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-002 — activeTrajectories loaded
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: RV-002 activeTrajectories persistence', { skip: skipMsg || noRuvector }, () => {
  it('RV-002a: activeTrajectories in defaults', () => {
    assert.ok(rvContent.includes('activeTrajectories: {}'),
      'ruvector cli.js should include activeTrajectories in default state');
  });

  it('RV-002b: activeTrajectories loaded from saved data', () => {
    assert.ok(rvContent.includes('activeTrajectories: data.activeTrajectories'),
      'ruvector cli.js should load activeTrajectories from saved file');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-003 — trajectory-end stats sync
// ══════════════════════════════════════════════════════════════════════════════

describe('embeddings-intelligence: RV-003 trajectory-end stats sync', { skip: skipMsg || noRuvector }, () => {
  it('RV-003a: syncs total_trajectories counter', () => {
    assert.ok(rvContent.includes('total_trajectories'),
      'ruvector cli.js should update total_trajectories counter');
    assert.ok(rvContent.includes('intel.data.stats.total_trajectories'),
      'ruvector cli.js should sync total_trajectories from actual data');
  });

  it('RV-003b: syncs total_patterns counter', () => {
    assert.ok(rvContent.includes('intel.data.stats.total_patterns'),
      'ruvector cli.js should sync total_patterns from actual data');
  });

  it('RV-003c: syncs total_memories counter', () => {
    assert.ok(rvContent.includes('intel.data.stats.total_memories'),
      'ruvector cli.js should sync total_memories from actual data');
  });
});
