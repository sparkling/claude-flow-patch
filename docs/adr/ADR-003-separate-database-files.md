# ADR-003: Separate Database Files for Schema Coexistence

## Status

Accepted

## Date

2026-02-21

## Context

Three incompatible SQLite schemas exist across the memory system:

| System | Database | Schema |
|--------|----------|--------|
| CLI monolith (sql.js) | `.swarm/memory.db` | `memories` table with `key`, `value`, `namespace`, `embedding` columns |
| HybridBackend SQLiteBackend | (new) | `MemoryEntry` table with `id`, `namespace`, `key`, `content`, `type`, `tags`, `metadata`, `version`, `accessLevel`, `references`, `accessCount`, `lastAccessedAt`, `embedding` |
| AgentDB | (new) | `episodes`, `skills`, `facts`, `notes` tables with vector indices |

These schemas are fundamentally incompatible. The monolith uses `value` where
HybridBackend uses `content`. The monolith lacks `type`, `accessLevel`,
`version`, and other NOT NULL columns. AgentDB uses an entirely different
table structure.

No data migration path exists between these schemas without lossy transformation.

## Decision

Use **separate database files** for each backend. Do not reuse the existing
`.swarm/memory.db` file.

```
.swarm/
  memory.db              # existing sql.js monolith (untouched, can be deleted)
  hybrid-memory.db       # NEW: SQLiteBackend (better-sqlite3)
  agentdb-memory.db      # NEW: AgentDBBackend (agentdb package)
```

Clean wipe -- no data migration from old schema. Old `.swarm/memory.db` can
be deleted when the user confirms the transition.

### Database path configuration

```javascript
const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');
```

**Critical config key names** (using the wrong key silently creates in-memory
databases that lose all data on process exit):

| Backend | Config Key | Correct | Wrong |
|---------|-----------|---------|-------|
| SQLiteBackend | `sqlite.databasePath` | `.swarm/hybrid-memory.db` | ~~`sqlite.path`~~ |
| AgentDBBackend | `agentdb.dbPath` | `.swarm/agentdb-memory.db` | ~~`agentdb.path`~~ |

## Consequences

### Positive

- No risk of corrupting existing data during transition
- Each backend owns its schema completely -- no compatibility constraints
- Clean separation makes rollback trivial (delete new files, old ones untouched)
- HybridBackend's dual-write keeps both files in sync automatically
- Independent WAL journals per database for better concurrent access

### Negative

- Existing data in `.swarm/memory.db` is not migrated (clean break)
- Two new database files consume additional disk space
- Users lose any previously stored memory entries (acceptable given the monolith
  had 6+ bugs making the data unreliable anyway)

### Risks

- `swarmDir` (`process.cwd() + '/.swarm/'`) must exist before database creation
- Wrong config key names (`path` instead of `databasePath`/`dbPath`) silently
  create in-memory databases -- documented prominently in plan and code comments

## Alternatives Considered

### 1. Migrate existing .swarm/memory.db to new schema

Rejected: schemas are too different for reliable migration. The monolith stores
`value` (string); HybridBackend expects `content` with NOT NULL constraints on
`type`, `accessLevel`, `version`, `references`, `accessCount`, `lastAccessedAt`.
Migration would require fabricating values for all these columns. Risk of data
corruption exceeds value of preserving data from a known-buggy system.

### 2. Reuse .swarm/memory.db path with HybridBackend

Rejected: `better-sqlite3` would try to open a file created by sql.js. While
both are SQLite, the table schemas differ. `CREATE TABLE IF NOT EXISTS` would
succeed but subsequent queries would fail due to missing columns. Silent
corruption risk.

### 3. Single database file for both SQLiteBackend and AgentDB

Rejected: SQLiteBackend and AgentDB have incompatible schemas. SQLiteBackend
stores flat `MemoryEntry` rows. AgentDB stores hierarchical
`episodes`/`skills`/`facts`/`notes`. Using one file would require schema
merging which neither backend supports.

## Implementation

- **Defect**: WM-001 (patch op WM-001c -- HybridBackendConfig construction)
- **Plan**: [memory-wiring-plan.md](../memory-wiring-plan.md), Task 2 "WM-001c"
- **Target file**: `memory/memory-initializer.js` (path var `MI`)
- **Config keys**: `sqlite.databasePath` and `agentdb.dbPath` -- see plan for critical notes
