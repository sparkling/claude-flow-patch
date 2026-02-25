# ADR-006: Concurrent Access Strategy -- SQLiteBackend-Only busy_timeout

## Status

Accepted

## Date

2026-02-21

## Context

Two separate processes access the same SQLite database files concurrently:

1. **MCP server process** (Task 2): holds a long-lived `HybridBackend` instance,
   handles `memory_store`/`memory_search` MCP tool calls
2. **Hook script process** (Task 4): short-lived `auto-memory-hook.mjs`, runs
   at session start (import) and session end (sync), lifetime ~500ms

Both write to `.swarm/hybrid-memory.db` (SQLiteBackend) and
`.swarm/agentdb-memory.rvf` (AgentDBBackend).

`better-sqlite3` is synchronous and has **NO default busy timeout**. If both
processes attempt to write simultaneously, the second writer gets `SQLITE_BUSY`
-- an immediate crash with no retry.

`SQLiteBackend` enables WAL mode (sqlite-backend.js:59-61), which allows
concurrent readers, but two writers still collide without a busy timeout.

### AgentDB PRAGMA limitation

`agentdb/dist/src/security/input-validation.js` (lines 50-61) defines:
```javascript
ALLOWED_PRAGMAS = [
  'journal_mode', 'synchronous', 'cache_size', 'temp_store',
  'mmap_size', 'page_size', 'auto_vacuum', 'wal_autocheckpoint'
]
```

`busy_timeout` is **NOT** in this whitelist. Any `.pragma('busy_timeout = ...')`
call on an AgentDB-managed connection throws `ValidationError`.

## Decision

Set `PRAGMA busy_timeout = 5000` on **SQLiteBackend connections only**. Accept
the risk of unprotected AgentDB connections.

```javascript
// After backend.initialize()
const sqliteBackend = hybridBackend.getSQLiteBackend();
if (sqliteBackend && sqliteBackend.db) {
  sqliteBackend.db.pragma('busy_timeout = 5000');
}
// AgentDB: CANNOT set busy_timeout (ALLOWED_PRAGMAS whitelist blocks it)
```

Both the MCP server (Task 2) and hook script (Task 4) apply this pragma.

### Shutdown handler

The MCP server registers a process exit handler to cleanly close connections:

```javascript
const shutdownHybrid = async () => {
  try { await hybridBackend.shutdown(); } catch {}
};
process.on('beforeExit', shutdownHybrid);
process.on('SIGTERM', () => { shutdownHybrid().then(() => process.exit(0)); });
process.on('SIGINT', () => { shutdownHybrid().then(() => process.exit(0)); });
```

## Consequences

### Positive

- SQLiteBackend (`hybrid-memory.db`) is protected: concurrent writes wait up
  to 5 seconds instead of crashing immediately
- 5 seconds is generous -- hook script lifetime is ~500ms
- WAL mode + busy_timeout is the standard SQLite concurrent access pattern
- Clean shutdown flushes WAL journal and closes connections properly
- Uses public accessor `getSQLiteBackend()` -- avoids TS-private property access

### Negative

- AgentDB connections (`agentdb-memory.rvf`) are **unprotected** against
  `SQLITE_BUSY` due to the `ALLOWED_PRAGMAS` whitelist
- Dual-write means BOTH databases receive writes -- if SQLiteBackend succeeds
  but AgentDB's write collides, the databases diverge

### Risks

- **AgentDB SQLITE_BUSY**: The MCP server and hook script use separate `.db`
  files for AgentDB. The hook's lifetime is ~500ms. Concurrent writes to the
  AgentDB file are rare. SQLiteBackend handles the majority of structured
  queries. Acceptable risk for v1.
- **Permanent divergence**: if AgentDB write fails due to SQLITE_BUSY, the
  SQLiteBackend has the entry but AgentDB doesn't. Next semantic search won't
  find it. Mitigation: entries are re-stored when accessed through MCP tools.
- **Future fix**: upstream PR to add `busy_timeout` to AgentDB's `ALLOWED_PRAGMAS`.

## Alternatives Considered

### 1. Set busy_timeout on both backends

Rejected: AgentDB's `input-validation.js` throws `ValidationError` for
`busy_timeout`. Cannot be set without forking/patching the agentdb package.

### 2. Access raw better-sqlite3 handle before AgentDB wraps it

Rejected: would require intercepting the AgentDB initialization sequence to
set the pragma before the whitelist check. Too fragile and couples to AgentDB
internals.

### 3. Use file locking (flock) between processes

Rejected: adds significant complexity. SQLite's built-in busy_timeout is the
correct mechanism. The problem is only that AgentDB blocks the pragma.

### 4. Single-process architecture (no concurrent access)

Rejected: the hook script must run as a standalone process (Claude Code hooks
execute as child processes, not in the MCP server's event loop). Cannot avoid
multi-process access.

### 5. Skip busy_timeout entirely, rely on WAL mode

Rejected: WAL mode allows concurrent reads but NOT concurrent writes. Two
simultaneous writers still produce `SQLITE_BUSY`. The hook script's timing
(session start/end) can overlap with MCP tool calls.

## Implementation

- **Defects**: WM-001 (patch op WM-001d -- MCP server), WM-003 (patch ops WM-003a/b -- hook script)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target files**: `memory/memory-initializer.js` (MCP server), `init/helpers-generator.js` (hook)
- **AgentDB gap**: Documented in plan R4 #39a -- `ALLOWED_PRAGMAS` whitelist blocks busy_timeout
