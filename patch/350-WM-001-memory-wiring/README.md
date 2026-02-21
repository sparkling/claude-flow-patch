# WM-001: Wire @claude-flow/memory HybridBackend into CLI

**Severity**: Critical
**GitHub**: [#829](https://github.com/ruvnet/claude-flow/issues/829)

## Root Cause

The CLI's memory system (`memory-initializer.js`) uses a monolithic sql.js
(WASM SQLite) backend with hand-rolled embedding search. The `@claude-flow/memory`
package provides a production-quality `HybridBackend` (native SQLite via
better-sqlite3 + AgentDB HNSW vector search) per ADR-006/ADR-009, but is never
imported at runtime. This means:

- No native SQLite (ACID, WAL mode, busy_timeout) -- only WASM sql.js
- No AgentDB vector indexing -- only brute-force cosine similarity
- 6+ upstream bugs (#1041, #949, #1030, #1032, #1108, #969) in the monolith
- ADR-048 AutoMemoryBridge cannot function without a wired backend

## Fix

Insert an early-return branch at the top of `initializeMemoryDatabase()` that:

1. Reads backend choice from env var / config.yaml / default
2. Imports `HybridBackend` and `createDefaultEntry` from `@claude-flow/memory`
3. Pre-loads the embedding model and creates a Float32Array wrapper
4. Constructs `HybridBackendConfig` with correct keys (`sqlite.databasePath`,
   `agentdb.dbPath`, `agentdb.vectorDimension`)
5. Initializes backend, sets PRAGMA busy_timeout on SQLiteBackend
6. Registers process shutdown handlers for clean WAL flush
7. Rewires `storeEntry`, `searchEntries`, `listEntries`, `getEntry`, `deleteEntry`
   to use HybridBackend adapters with namespace 'all' translation, keyword
   fallback, createDefaultEntry(), and structured routing for offset support

Uses separate DB files (`.swarm/hybrid-memory.db` + `.swarm/agentdb-memory.db`)
to avoid schema conflict with existing `.swarm/memory.db`.

Fails loud on import/init failure -- no silent fallback to sql.js. Users who
want WASM-only set `backend: sqljs` explicitly.

## Files Patched

- `memory/memory-initializer.js`

## Ops

5 ops in fix.py (WM-001a through WM-001e, logically grouped into 2 patch() calls)
