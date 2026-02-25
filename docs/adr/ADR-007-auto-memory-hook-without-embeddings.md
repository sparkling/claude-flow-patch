# ADR-007: AutoMemoryBridge Hook Runs Without Embedding Generator

## Status

Accepted

## Date

2026-02-21

## Context

The `auto-memory-hook.mjs` script runs as a standalone process triggered by
Claude Code session hooks:
- **SessionStart**: `node .claude/helpers/auto-memory-hook.mjs import`
- **SessionEnd**: `node .claude/helpers/auto-memory-hook.mjs sync`

The script creates its own `HybridBackend` instance (it cannot share the MCP
server's instance because they are separate OS processes).

The MCP server's `HybridBackend` has an `embeddingGenerator` callback that wraps
the existing `loadEmbeddingModel()` / `generateEmbedding()` pipeline from
`memory-initializer.js`. This pipeline:
1. Lazy-loads ONNX via `@xenova/transformers` (~500ms cold start)
2. Downloads model weights on first use (~100MB for all-MiniLM-L6-v2)
3. Generates 384-dimensional vectors

The hook script has a total lifetime budget of ~500ms (Claude Code hook timeout).
Loading the ONNX runtime alone exceeds this budget.

## Decision

The hook script creates `HybridBackend` **without `embeddingGenerator`**.

```javascript
const backend = new HybridBackend({
  sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
  agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.rvf'), vectorBackend: 'rvf' },
  dualWrite: true,
  // No embeddingGenerator -- hook does file I/O only
});
```

### Import behavior (SessionStart)

`AutoMemoryBridge.importFromAutoMemory()` reads `~/.claude/projects/<project>/memory/*.md`,
parses entries, and calls `bulkInsert()`. Without `embeddingGenerator`:
- Entries are stored in SQLiteBackend (structured data -- key, content, tags)
- Entries are stored in AgentDB without HNSW embeddings
- Entries are searchable by exact/prefix/tag queries (SQLite routing)
- Entries are **invisible** to semantic search (HNSW index has no vectors)

### Sync behavior (SessionEnd)

`AutoMemoryBridge.syncToAutoMemory()` queries high-confidence entries from the
backend and writes them to MEMORY.md and topic files. This is a read-then-write-files
operation. No new embeddings are generated.

### Embedding backfill

When the MCP server processes a `memory_search` or `memory_store` call that
touches these entries, its `embeddingGenerator` generates embeddings. Entries
become semantically searchable after their first access through MCP tools.

## Consequences

### Positive

- Hook completes within the ~500ms timeout budget
- No ONNX runtime loading overhead in the hook
- Import/sync operations work correctly for their primary purpose (file I/O)
- SQLite-based queries (exact key lookup, tag filtering) work immediately
- Embeddings are generated lazily by the MCP server on demand

### Negative

- Freshly imported entries have no HNSW embeddings until accessed via MCP tools
- Semantic search (`memory_search` with natural language queries) returns
  incomplete results until embeddings are backfilled
- No explicit "backfill all embeddings" trigger exists

### Risks

- A user imports 50 auto-memory entries at session start, then immediately runs
  a semantic search before any MCP access. The search returns 0 results even
  though entries exist. Mitigation: the user's typical first MCP interaction
  triggers embedding generation for accessed entries.
- `bulkInsert()` without `embeddingGenerator` may behave differently across
  AgentDB versions. Currently confirmed to store entries without embeddings
  (not crash). Not transactional -- partial data on crash is acceptable because
  import is idempotent (re-run on next session).

## Alternatives Considered

### 1. Include embeddingGenerator in the hook

Rejected: loading `@xenova/transformers` adds ~500ms cold start. The hook's
total budget is ~500ms (Claude Code hook timeout). Embedding generation for
even a small number of entries would cause timeout and hook failure.

### 2. Pre-warm the model in a background process

Rejected: adds significant complexity (background daemon, IPC for model sharing).
The MCP server already has a warm model instance. Lazy backfill through MCP
achieves the same result with zero additional infrastructure.

### 3. Use hash-based embeddings in the hook

Considered: the existing `generateEmbedding()` falls back to hash-based
embeddings when ONNX is unavailable. These are fast (~1ms) but produce
low-quality vectors that pollute the HNSW index. The MCP server would then
generate real ONNX embeddings, creating a dimension/quality mismatch.
Rejected to avoid mixed-quality vectors in the same index.

### 4. Skip AgentDB entirely in the hook (SQLite-only)

Considered: would avoid the embedding gap. But `AutoMemoryBridge` expects
`IMemoryBackend`, and a SQLite-only backend would miss entries that the MCP
server stores in AgentDB. Maintaining consistency by using the same
`HybridBackend` with `dualWrite: true` is simpler.

## Implementation

- **Defect**: WM-003 (patch ops WM-003a/b -- doImport + doSync)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target file**: `init/helpers-generator.js` (path var `HELPERS_GEN`)
- **Template escaping**: `\${...}` in fix.py -- see plan R4 #39b
