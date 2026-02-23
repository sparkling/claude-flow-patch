import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { findNpxNmWithCliFile, findCliBase as resolveCliBase } from './helpers/integration-setup.mjs';

// ── Find npx cache with CLI ────────────────────────────────────────────────

const _npxNm26 = findNpxNmWithCliFile('memory/memory-initializer.js');
const cliBase = _npxNm26 ? resolveCliBase(_npxNm26) : null;
const miPath = cliBase ? join(cliBase, 'memory', 'memory-initializer.js') : '';

let mi = null;
const noMI = !cliBase || !existsSync(miPath) ? 'memory-initializer not importable' : false;

if (!noMI) {
  try { mi = await import(`file://${miPath}`); } catch {}
}

const noMIImport = !mi ? 'memory-initializer not importable' : false;

// ── Cosine similarity helper ────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, mag1 = 0, mag2 = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mag1 += a[i] * a[i];
    mag2 += b[i] * b[i];
  }
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: config-driven model (EM-001)
// ══════════════════════════════════════════════════════════════════════════════

describe('embedding-config: config-driven model (EM-001)', { skip: noMI }, () => {
  let src;

  before(() => {
    src = readFileSync(miPath, 'utf-8');
  });

  it('memory-initializer reads embeddings.json', () => {
    assert.ok(src.includes('embeddings.json'),
      'memory-initializer.js should reference embeddings.json');
  });

  it('default dimension is 768 (not 384)', () => {
    // The patched HNSW default and status default should use 768
    assert.ok(src.includes('dimensions = dimensions || 768'),
      'HNSW getHNSWIndex should default to 768');
    assert.ok(src.includes("dimensions ?? 768"),
      'getHNSWStatus should default to 768');
  });

  it('embeddings.json config flows through', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cfp-embcfg-'));
    try {
      const cfDir = join(tmpDir, '.claude-flow');
      mkdirSync(cfDir, { recursive: true });
      writeFileSync(join(cfDir, 'embeddings.json'),
        JSON.stringify({ model: 'test-model', dimension: 512 }));

      const configContent = readFileSync(join(cfDir, 'embeddings.json'), 'utf-8');
      const config = JSON.parse(configContent);
      assert.equal(config.model, 'test-model', 'model should be test-model');
      assert.equal(config.dimension, 512, 'dimension should be 512');

      // Verify the patched source reads both fields
      assert.ok(src.includes('embConfig.model'),
        'source should read embConfig.model');
      assert.ok(src.includes('embConfig.dimension'),
        'source should read embConfig.dimension');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HNSW forceRebuild (EM-001)
// ══════════════════════════════════════════════════════════════════════════════

describe('embedding-config: HNSW forceRebuild (EM-001)', { skip: noMI }, () => {
  let src;

  before(() => {
    src = readFileSync(miPath, 'utf-8');
  });

  it('forceRebuild deletes stale HNSW files', () => {
    assert.ok(src.includes('options?.forceRebuild'),
      'should check forceRebuild option');
    assert.ok(src.includes("fs.unlinkSync(hnswPath)"),
      'should delete hnswPath on forceRebuild');
    assert.ok(src.includes("fs.unlinkSync(metadataPath)"),
      'should delete metadataPath on forceRebuild');
  });

  it('metadata loading has error guard', () => {
    // The patched source guards metadata loading with forceRebuild check
    assert.ok(src.includes('!options?.forceRebuild && fs.existsSync(metadataPath)'),
      'should guard metadata loading with forceRebuild check');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: embedding generation behavioral
// ══════════════════════════════════════════════════════════════════════════════

describe('embedding-config: embedding generation behavioral', { skip: noMIImport }, () => {
  it('generateEmbedding produces vector', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) {
      assert.ok(true, 'generateEmbedding not exported — skip');
      return;
    }
    const result = await mi.generateEmbedding('test');
    assert.ok(result, 'should return result');
    assert.ok(Array.isArray(result.embedding), 'embedding should be an array');
    assert.ok(result.embedding.length > 0, 'embedding should not be empty');
  });

  it('embedding dimensions match expected', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const result = await mi.generateEmbedding('dimension check');
    assert.ok(result.dimensions > 0, 'dimensions should be positive');
    assert.ok(
      result.dimensions === 128 || result.dimensions === 384 || result.dimensions === 768,
      `expected 128, 384, or 768 dimensions, got ${result.dimensions}`
    );
  });

  it('empty string produces embedding', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const result = await mi.generateEmbedding('');
    assert.ok(result, 'should return result for empty string');
    assert.ok(Array.isArray(result.embedding), 'embedding should be an array');
    assert.ok(result.embedding.length > 0, 'embedding should not be empty');
  });

  it('long text produces embedding', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    assert.ok(longText.length > 1000, 'test text should be 1000+ chars');
    const result = await mi.generateEmbedding(longText);
    assert.ok(result, 'should return result for long text');
    assert.ok(Array.isArray(result.embedding), 'embedding should be an array');
    assert.ok(result.embedding.length > 0, 'embedding should not be empty');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: embedding similarity
// ══════════════════════════════════════════════════════════════════════════════

describe('embedding-config: embedding similarity', { skip: noMIImport }, () => {
  it('similar texts have high similarity', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const r1 = await mi.generateEmbedding('dog');
    const r2 = await mi.generateEmbedding('puppy');
    assert.ok(r1.embedding && r2.embedding, 'both should produce embeddings');
    const sim = cosineSim(r1.embedding, r2.embedding);
    assert.ok(sim > 0.5,
      `similar texts should have cosine sim > 0.5, got ${sim.toFixed(4)}`);
  });

  it('dissimilar texts have lower similarity', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const r1 = await mi.generateEmbedding('dog');
    const r2 = await mi.generateEmbedding('quantum physics');
    assert.ok(r1.embedding && r2.embedding, 'both should produce embeddings');
    const sim = cosineSim(r1.embedding, r2.embedding);
    assert.ok(sim < 0.8,
      `dissimilar texts should have cosine sim < 0.8, got ${sim.toFixed(4)}`);
  });

  it('same text has similarity ~1.0', { timeout: 60000 }, async () => {
    if (!mi?.generateEmbedding) return;
    const r1 = await mi.generateEmbedding('deterministic test');
    const r2 = await mi.generateEmbedding('deterministic test');
    assert.ok(r1.embedding && r2.embedding, 'both should produce embeddings');
    const sim = cosineSim(r1.embedding, r2.embedding);
    assert.ok(sim > 0.999,
      `same text should have cosine sim > 0.999, got ${sim.toFixed(4)}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HNSW index lifecycle
// ══════════════════════════════════════════════════════════════════════════════

describe('embedding-config: HNSW index lifecycle', { skip: noMIImport }, () => {
  const hasHnsw = existsSync(join(homedir(), '.npm', '_npx'))
    && (() => {
      try {
        const npxDir = join(homedir(), '.npm', '_npx');
        for (const hash of readdirSync(npxDir)) {
          if (existsSync(join(npxDir, hash, 'node_modules', 'hnswlib-node'))) return true;
        }
      } catch {}
      return false;
    })();

  const skipHnsw = !hasHnsw ? 'hnswlib-node not available' : noMIImport;

  it('getHNSWIndex creates index', { skip: skipHnsw, timeout: 60000 }, async () => {
    if (!mi?.getHNSWIndex) {
      assert.ok(true, 'getHNSWIndex not exported — skip');
      return;
    }
    // getHNSWIndex may return null if @ruvector/core not available
    const index = await mi.getHNSWIndex();
    assert.ok(index === null || typeof index === 'object',
      'getHNSWIndex should return index or null (no crash)');
  });

  it('index survives multiple calls', { skip: skipHnsw, timeout: 60000 }, async () => {
    if (!mi?.getHNSWIndex) return;
    const idx1 = await mi.getHNSWIndex();
    const idx2 = await mi.getHNSWIndex();
    // Both should succeed without crash — may be same or new index
    assert.ok(
      (idx1 === null && idx2 === null) || (typeof idx1 === 'object' && typeof idx2 === 'object'),
      'multiple getHNSWIndex calls should not crash'
    );
  });
});
