# ADR-001: Use HybridBackend Directly as Memory Backend

## Status

Accepted

## Date

2026-02-21

## Context

The `@claude-flow/memory` package exposes three API layers for memory operations:

| API | Importable from Root? | True Hybrid (SQLite + AgentDB)? |
|-----|----------------------|---------------------------------|
| `UnifiedMemoryService` | Yes | No -- constructor hardcodes `AgentDBAdapter` only |
| `MemoryApplicationService` + `HybridMemoryRepository` | No -- blocked by package `exports` map | Yes |
| `HybridBackend` | Yes | Yes -- creates both `SQLiteBackend` + `AgentDBBackend` |

The CLI currently uses a monolithic sql.js (WASM) implementation in
`memory-initializer.js` that has 6+ known bugs (#1041, #949, #1030, #1032,
#1108, #969). The upstream design intent (ADR-006, ADR-009) specifies a unified
memory service with pluggable backends, but this was never wired into the CLI
at runtime.

## Decision

Use `HybridBackend` directly as the `IMemoryBackend` implementation for all
CLI memory operations.

```
HybridBackend (implements IMemoryBackend)
  ├── SQLiteBackend (ACID, exact/prefix/tag queries via better-sqlite3)
  ├── AgentDBBackend (HNSW vector search via agentdb package)
  ├── dualWrite: true (default) -- writes to BOTH via Promise.all()
  └── routingStrategy: 'auto' -- routes reads by query type
```

Import via:
```javascript
const { HybridBackend, createDefaultEntry } = await import('@claude-flow/memory');
```

Create adapter functions that map the existing `storeEntry`/`searchEntries`/
`listEntries`/`getEntry`/`deleteEntry` signatures to `HybridBackend` methods.
The rest of the call chain (`memory-tools.js`, `mcp-client.js`, `mcp-server.js`)
remains unchanged.

## Consequences

### Positive

- Implements upstream ADR-006 (Unified Memory Service) and ADR-009 (Hybrid Backend)
- Dual-write gives both ACID SQLite and HNSW vector search simultaneously
- Auto query routing: exact/prefix/tag -> SQLite, semantic -> AgentDB, hybrid -> both
- Bypasses 6+ known bugs in the sql.js monolith without fixing them individually
- Unblocks ADR-048 Phase 2 (AutoMemoryBridge requires `IMemoryBackend`)
- `createDefaultEntry()` handles all NOT NULL field defaults via `generateMemoryId()`

### Negative

- Requires `better-sqlite3` native bindings (not pure JS like sql.js)
- `better-sqlite3` has a static top-level import in `SQLiteBackend` -- if native
  bindings are unavailable, the entire `@claude-flow/memory` package fails to import
- Larger surface area (three packages: `@claude-flow/memory`, `agentdb`, `better-sqlite3`)
- `UnifiedMemoryService` (the "official" high-level API) cannot be used because it
  hardcodes `AgentDBAdapter` and its `createHybridService()` is unimplemented

### Risks

- `better-sqlite3` on Node 24 requires RS-001 patch for native bindings
- AgentDB's `ALLOWED_PRAGMAS` whitelist blocks `busy_timeout` (see ADR-006)
- Users without working native bindings must explicitly choose `backend: sqljs`

## Alternatives Considered

### 1. UnifiedMemoryService

Rejected: constructor hardcodes `AgentDBAdapter`, no SQLite. `createHybridService()`
at line 345 admits: "This would require extending UnifiedMemoryService to support
HybridBackend". Not a real hybrid backend.

### 2. MemoryApplicationService + HybridMemoryRepository

Rejected: lives in `dist/application/` and `dist/infrastructure/`, not re-exported
from root. Deep imports blocked by package `exports` map (`"./*"` only matches
single path segment). Not importable at runtime.

### 3. Fix the sql.js monolith bugs individually

Rejected: 6+ bugs across SQL injection, schema mismatches, missing columns,
hardcoded dimensions. The `@claude-flow/memory` package already has correct
implementations. Patching the monolith duplicates work that's already done.

### 4. Full function replacement in memory-initializer.js

Rejected: `patch()` uses string replacement. Full function replacement requires
enormous `old_string` blocks that break on any upstream change. Instead, use
early-return branching: insert at the top of each function, keeping `old_string`
minimal.

## Implementation

- **Defect**: WM-001 (patch ops WM-001a through WM-001e)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target file**: `memory/memory-initializer.js` (path var `MI`)
- **Adapter mapping**: Plan Task 2, "API compatibility -- adapter mapping" section
