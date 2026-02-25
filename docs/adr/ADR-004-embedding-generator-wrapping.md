# ADR-004: Embedding Generator Wrapping Pattern

## Status

Accepted

## Date

2026-02-21

## Context

`HybridBackend` requires an `embeddingGenerator` callback in its config to
enable semantic search and HNSW indexing:

```typescript
type EmbeddingGenerator = (content: string) => Promise<Float32Array>;
```

Without this callback:
- `store()` writes entries **without embeddings** -- HNSW index stays empty
- `querySemantic()` **throws** on every call: `'SemanticQuery requires either
  content or embedding'`

The existing `memory-initializer.js` already has a full embedding pipeline:
- `loadEmbeddingModel()` (lines 1160-1254): lazy-loads ONNX via `@xenova/transformers`,
  falls back to hash-based embeddings (never returns null -- always succeeds)
- `generateEmbedding(text)` (lines 1259-1287): returns
  `{ embedding: number[], dimensions: number, model: string }`

However, the existing function returns `{ embedding: number[], ... }` (an object
with a plain `number[]` array), not a `Float32Array`. `AgentDBBackend.storeInAgentDB()`
at line 505 does `Buffer.from(entry.embedding.buffer)` -- `.buffer` is a property
of typed arrays (`Float32Array.prototype.buffer`) but is `undefined` on plain
`number[]`, causing a `TypeError`.

## Decision

Create a thin wrapper that bridges the existing `generateEmbedding()` function
to the `HybridBackend` expected type:

```javascript
const embeddingGeneratorForHybrid = async (text) => {
  const result = await generateEmbedding(text);  // existing function, never fails
  return new Float32Array(result.embedding);      // must be Float32Array, not number[]
};
```

### Pre-load model for dimension detection

Before constructing `HybridBackendConfig`, pre-load the embedding model to
determine actual vector dimensions:

```javascript
await loadEmbeddingModel();  // lazy + idempotent
const modelDimensions = (embeddingModelState && embeddingModelState.dimensions) || 384;
```

Pass `modelDimensions` to `agentdb.vectorDimension` to prevent HNSW index
mismatch. `AgentDBBackendConfig` defaults to 1536 dimensions; actual ONNX
models produce 384 (MiniLM) or 768 (mpnet).

### Guarantees

1. **Never returns null**: `generateEmbedding()` always succeeds due to hash
   fallback at lines 1232-1244
2. **Always returns Float32Array**: explicit `new Float32Array()` conversion
3. **Reuses all existing infrastructure**: lazy ONNX loading, `embeddings.json`
   config, EM-001/EM-002 patches, hash fallback
4. **Correct dimensions**: pre-loaded model provides actual dimensions, not
   hardcoded defaults

## Consequences

### Positive

- Zero new model loading code -- reuses battle-tested existing pipeline
- Hash fallback ensures embeddings always succeed even without ONNX runtime
- Correct `Float32Array` type prevents `Buffer.from()` crashes in AgentDB
- Dimension detection prevents HNSW index corruption (384 vs 1536 mismatch)
- Existing EM-001/EM-002 patches (config reading, cache permissions) still apply

### Negative

- Thin wrapper adds ~5 lines of indirection
- `loadEmbeddingModel()` can technically fail (catch at line 1246 sets state
  fields to null) -- the `|| 384` fallback handles this

### Risks

- If `embeddingModelState.dimensions` is null after a failed load, we fall back
  to 384. If the user later fixes the model and it produces 768-dim vectors,
  the HNSW index has the wrong dimensionality. Mitigation: this only happens
  if ONNX loading fails, in which case the hash fallback produces exactly
  `dimensions` (from config or 384) anyway.

## Alternatives Considered

### 1. Return number[] directly

Rejected: `AgentDBBackend.storeInAgentDB()` does `Buffer.from(entry.embedding.buffer)`.
Plain `number[]` has no `.buffer` property -- `TypeError` on every store operation.

### 2. Create a new embedding pipeline

Rejected: the existing pipeline handles lazy loading, config-driven model
selection, ONNX runtime initialization, cache directory management, hash
fallback, and dimension tracking. Reimplementing this adds hundreds of lines
with no benefit.

### 3. Modify AgentDBBackend to accept number[]

Rejected: AgentDB is an upstream package we don't control. Cannot patch its
internal `Buffer.from()` call. The type contract (`Float32Array`) is correct --
our wrapper must conform to it.

### 4. Skip embeddingGenerator entirely

Rejected: without it, `querySemantic()` throws on every call and `store()` never
generates embeddings. This makes semantic search completely broken -- the primary
value proposition of the hybrid backend.

## Implementation

- **Defect**: WM-001 (patch op WM-001e -- embedding wrapper + model pre-load)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target file**: `memory/memory-initializer.js` (path var `MI`)
- **Existing code reused**: `loadEmbeddingModel()` lines 1160-1254, `generateEmbedding()` lines 1259-1287
