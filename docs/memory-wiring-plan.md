# Plan: Four Init/Memory Tasks

## Context

Analysis across multiple sessions revealed three distinct problems in
`@claude-flow/cli` v3.1.0-alpha.44. Validation against upstream ADRs, GitHub
issues, commits, and source code in `~/source/claude-flow/` confirms our approach
matches the original design intent.

**Upstream ADRs that define the intended architecture:**
- ADR-006 (Unified Memory Service) — single MemoryService, pluggable backends via config
- ADR-009 (Hybrid Memory Backend) — SQLite + AgentDB, auto query routing, dual-write
- ADR-005 (MCP-First API) — CLI → callMCPTool() → tool handlers → business logic
- ADR-048 (AutoMemoryBridge) — Claude Code auto-memory sync (Phase 1 done, 2-4 blocked on wiring)
- ADR-050 (Intelligence Loop) — PageRank memory in hooks (fully implemented, no conflict)

**Upstream GitHub issues confirming the gaps:**
- #927 — V3 master tracking, Agent #7 Memory Specialist, ADR-006/009 targets
- #829 — AgentDB integration plan, UnifiedMemoryService with HybridBackend
- #1041 — memory store/search broken (ID mismatch, missing column, hardcoded dims)
- #1108 — sql.js not listed as dependency, breaks all memory ops
- #949 — schema mismatch (missing `type` column)
- #969 — MCP tools cache stale data after CLI writes
- #1030 — SQL injection in memory-initializer.js (4 injection points)
- #1032 — memory_store crashes on undefined value
- #1142 — config export shows hardcoded defaults, ignores config.yaml
- #1143 — embedding model + HNSW dims hardcoded, ignore embeddings.json

**Key commit**: `dc49af776` (2026-01-04) "Implement critical ADR requirements" —
only produced markdown docs (963 insertions), not compiled code. The actual
implementation lives in `@claude-flow/memory` npm package.

**Three disconnected memory systems coexist:**

| System | Package | SQLite Engine | HNSW Index | Used at Runtime? |
|--------|---------|---------------|------------|-----------------|
| CLI monolith | `@claude-flow/cli` memory-initializer.js | sql.js (WASM) | @ruvector/core VectorDb | **YES** |
| Memory package | `@claude-flow/memory` HybridBackend/etc. | better-sqlite3 (native) | Pure-JS HNSWIndex | **NO** |
| AgentDB | `agentdb@2.0.0-alpha.3.7` | sql.js + optional better-sqlite3 | hnswlib-node/ruvector | **NO** |

None are connected. The CLI never imports `@claude-flow/memory` at runtime (except
a stub in helpers-generator.js that prints a message and returns). The `agentdb`
package is installed as a transitive dependency of `@claude-flow/memory` but never
instantiated.

**`HybridBackend` dependency chain** (relevant for Task 2):
- `HybridBackend` → creates `SQLiteBackend` (static `import Database from 'better-sqlite3'`)
- `HybridBackend` → creates `AgentDBBackend` (dynamic `import('agentdb')`, graceful fallback)
- If better-sqlite3 native bindings fail (Node 24 / RS-001), SQLiteBackend import
  throws at module load time → HybridBackend itself cannot be imported
- Graceful fallback to sql.js monolith is CRITICAL for Task 2

**Schema difference**: CLI's `memory-initializer.js` creates a `memories` table.
`HybridBackend`'s `SQLiteBackend` creates a different schema for `MemoryEntry`.
The `agentdb` package uses `episodes/skills/facts/notes` tables. These schemas
are incompatible — clean wipe and reinstall; no data migration needed.

---

## Task 1: Fix Wizard Capture Bugs (new defect SG-006)

### Problem

Three wizard answers are collected but never forwarded to `executeInit()`:

| Lost Answer | Wizard Line | What Happens |
|-------------|------------|--------------|
| `enableEmbeddings` | init.js:571 | `confirm()` stored in local var, never assigned to `options.embeddings.enabled` |
| `embeddingModel` | init.js:577 | `select()` stored in local var, never assigned to `options.embeddings.model` |
| `permissionRequest` hook | init.js:498 | Offered in `multiSelect()`, but no `options.hooks.permissionRequest = ...` line |

Plus: topology hardcoded as `--topology hierarchical` at init.js:678 in the
`--start-all` path, ignoring `options.runtime.topology` set at init.js:519.

No upstream issue exists for the embeddings/permissionRequest capture bugs.
SG-004 already fixes flag parity but NOT these capture bugs.

### Fix

**Target file**: `commands/init.js` (path var: `INIT_CMD`)

**Patch ops** (2 ops — SG-006a dropped per Review 4, see below):

1. **SG-006b**: After hooks multiSelect (~line 500), add:
   ```javascript
   options.hooks.permissionRequest = hooks.includes('permissionRequest');
   ```

2. **SG-006c**: At line 678, replace hardcoded `--topology hierarchical` with
   template using `options.runtime.topology || 'hierarchical-mesh'`.

**Dropped — SG-006a (embeddings capture)**: Review 4 found this is a no-op.
`executeInit()` never reads `options.embeddings.enabled` or `options.embeddings.model`.
The wizard's `enableEmbeddings` and `embeddingModel` local vars ARE already used
directly at lines 611-616 via `execSync` calls that write `embeddings.json`.
Assigning to `options.embeddings.*` would have no effect since no downstream
code consumes those properties. The embeddings wizard flow works correctly as-is.

### Upstream alignment

- Matches #1181 (SG-004) intent — wizard should have full parity with init
- Matches #993 — init should deploy all configured features
- No ADR conflict

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `commands/init.js` | `INIT_CMD` | 2 patch ops (SG-006a dropped — no-op) |

### Verification

- Run wizard, select `all-mpnet-base-v2` model → check `embeddings.json` uses it
- Run wizard, select `star` topology → check `config.yaml` topology matches
- Run wizard with `--start-all` → verify swarm init uses selected topology

---

## Task 2: Wire @claude-flow/memory into CLI (new defect WM-001)

### Problem

The CLI's MCP memory tools always import `memory-initializer.js` (monolith sql.js).
The `@claude-flow/memory` package provides the intended `UnifiedMemoryService` with
real backends per ADR-006/009 — but is never imported at runtime.

This also means 6+ upstream bugs (#1041, #949, #1030, #1032, #1108, #969) exist
in the monolith that the @claude-flow/memory package doesn't have.

### Upstream design (ADR-006 + ADR-009)

ADR-006 specifies this interface:
```typescript
interface IMemoryService {
  store(entry: MemoryEntry): Promise<string>;
  retrieve(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  searchSemantic(text: string, k: number): Promise<MemoryEntry[]>;
  listNamespaces(): Promise<string[]>;
  clearNamespace(namespace: string): Promise<void>;
}
```

ADR-009 specifies backend selection:
```typescript
HybridBackend (Intelligent Router)
├── SQLiteBackend (ACID, exact matches, prefix queries)
└── AgentDBAdapter (HNSW vector search, semantic similarity)
```

With automatic query routing:
| Query Type | Backend |
|------------|---------|
| exact/prefix/tag | SQLite |
| semantic | AgentDB (HNSW) |
| hybrid | Both, merged |
| auto (has embedding) | AgentDB |
| auto (has key) | SQLite |
| auto (default) | AgentDB |

### Three APIs exist — only one is importable AND hybrid

`@claude-flow/memory` has three API layers. Package `exports` map restricts
what can actually be imported at runtime:

| API | Importable from root? | True hybrid? | Verdict |
|-----|----------------------|-------------|---------|
| `UnifiedMemoryService` | YES | **NO** — constructor hardcodes `AgentDBAdapter`. `createHybridService()` at line 345 admits: _"This would require extending UnifiedMemoryService to support HybridBackend"_ | Wrong backend |
| `MemoryApplicationService` + `HybridMemoryRepository` | **NO** — lives in `dist/application/` and `dist/infrastructure/`, not re-exported from root. Deep imports blocked by `exports` map (`"./*"` only matches single path segment) | YES | Not importable |
| `HybridBackend` | **YES** — exported from root | **YES** — creates both `SQLiteBackend` + `AgentDBBackend`, dual-write by default, auto query routing | **Use this** |

**Use `HybridBackend` directly** — it implements `IMemoryBackend`, is exported
from root, and is the true dual SQLite+AgentDB backend per ADR-009:

```
HybridBackend (implements IMemoryBackend)
  ├── SQLiteBackend (ACID, exact/prefix/tag queries)
  ├── AgentDBBackend (HNSW vector search, semantic similarity)
  ├── dualWrite: true (default) — writes to BOTH via Promise.all()
  └── routingStrategy: 'auto' — routes reads by query type
```

Import is simple:
```javascript
const { HybridBackend } = await import('@claude-flow/memory');
```

### Architecture change

Current chain:
```
MCP tool → memory-tools.js:70 → getMemoryFunctions() → memory-initializer.js → sql.js
```

Target chain (per ADR-009):
```
MCP tool → memory-tools.js → getMemoryFunctions()
  → memory-initializer.js → HybridBackend (dual SQLite + AgentDB)
```

The change is inside `memory-initializer.js`. When `@claude-flow/memory` is
available, `initializeMemoryDatabase()` creates a `HybridBackend` instead of
the sql.js monolith. The adapter functions (`storeEntry`, `searchEntries`, etc.)
are rewired to call `HybridBackend` methods. The rest of the call chain
(`memory-tools.js`, `mcp-client.js`, `mcp-server.js`) is unchanged.

### API compatibility — adapter mapping

Current `memory-initializer.js` exports:
```
storeEntry({key, value, namespace, generateEmbeddingFlag, tags, ttl, upsert})
searchEntries({query, namespace, limit, threshold})
listEntries({namespace, limit, offset})
getEntry({key, namespace})
deleteEntry({key, namespace})
```

`HybridBackend` provides (implements `IMemoryBackend`):
```
store(entry: MemoryEntry)             // full entry object with id, namespace, key, value, etc.
get(id: string)                       // → MemoryEntry | null
getByKey(namespace, key)              // → MemoryEntry | null
update(id, update)                    // → MemoryEntry | null
delete(id)                            // → boolean
query(query: MemoryQuery)             // structured query with namespace, limit, offset
querySemantic(query: SemanticQuery)   // text + namespace + threshold → semantic search
queryHybrid(query: HybridQuery)       // combined structured + semantic
search(embedding, options)            // raw vector search
bulkInsert(entries)                   // batch insert
count(namespace?)                     // entry count
listNamespaces()                      // → string[]
clearNamespace(namespace)             // → number deleted
getStats()                            // backend health + counts
```

Adapter mapping (each adapter 10-20 lines due to entry construction and fallbacks):

**Namespace `'all'` handling (R4 #40)**: The current monolith treats `namespace: 'all'`
as a cross-namespace wildcard. `HybridBackend` treats `'all'` as a literal namespace
name. ALL adapters must translate: `if (namespace === 'all') namespace = undefined;`

**ID generation (R4 R4-4)**: Do NOT use `crypto.randomUUID()` — not available on
Node 18 LTS without flags. Use the existing pattern from memory-initializer.js line
1549: `` `entry_${Date.now()}_${Math.random().toString(36).substring(7)}` ``

**Entry construction (R4 #44)**: Use `createDefaultEntry()` from `@claude-flow/memory`
(exported from root, types.js:20-40) instead of manual MemoryEntry construction.
It handles all NOT NULL field defaults via `generateMemoryId()`. Override `namespace`,
`key`, `content` (from `value`), `tags`, `type`.

| Old function | HybridBackend method | Notes |
|-------------|---------------------|-------|
| `storeEntry({key, value, namespace, tags, ttl})` | `const entry = createDefaultEntry(); entry.namespace = ns; entry.key = key; entry.content = value; entry.tags = tags \|\| []; backend.store(entry)` | Use `createDefaultEntry()` for all defaults. `value` maps to `content`. `tags`/`metadata`/`references` are real JS types (array/object), NOT JSON strings. For upsert: `getByKey()` first, then `update()` or `store()`. Upsert preserves existing entry ID (#41). |
| `searchEntries({query, namespace, limit, threshold})` | `backend.querySemantic({content: query, namespace: ns, limit, threshold})` then keyword fallback | Field is `content` (not `text`). **CRITICAL (R4 R4-3)**: Must add keyword fallback — if `querySemantic` returns 0 results, fall back to `backend.query({namespace: ns, limit, type: 'structured'})` with SQL LIKE filter on content. Current monolith does this at lines 1672-1678 (keyword search). Without fallback = behavioral regression. |
| `listEntries({namespace, limit, offset})` | `backend.query({namespace: ns, limit, offset, type: 'structured'})` | **CRITICAL (R4 #47)**: Must pass `type: 'structured'` to force SQLite routing. Without it, `autoRoute()` defaults to AgentDB which ignores `offset`. |
| `getEntry({key, namespace})` | `backend.getByKey(ns, key)` | Always by key+namespace (no `id` param in actual signature) |
| `deleteEntry({key, namespace})` | `const entry = await backend.getByKey(ns, key); if (entry) await backend.delete(entry.id)` | Lookup by key+namespace first, then delete by id |

`HybridBackendConfig`:
```typescript
{
  sqlite?: Partial<SQLiteBackendConfig>;  // passed to SQLiteBackend (better-sqlite3)
  agentdb?: Partial<AgentDBBackendConfig>; // passed to AgentDBBackend (wraps agentdb pkg)
  defaultNamespace?: string;     // default: 'default'
  embeddingGenerator?: fn;       // REQUIRED for semantic search — see "Embedding generator" below
  routingStrategy?: string;      // 'auto' | 'sqlite-first' | 'agentdb-first'
  dualWrite?: boolean;           // default: true — writes to BOTH backends
  semanticThreshold?: number;    // default: 0.7
  hybridMaxResults?: number;     // default: 100
}
```

**CRITICAL: `SQLiteBackendConfig` uses `databasePath` (not `path`).
`AgentDBBackendConfig` uses `dbPath` (not `path`).** Using the wrong key
silently creates in-memory databases that lose all data on process exit.

**Internal wiring:**
- `HybridBackend` creates `SQLiteBackend` (static import of `better-sqlite3`) +
  `AgentDBBackend` (dynamic import of `agentdb` package with fallback)
- `dualWrite: true` (default) → `store()/update()/delete()` write to BOTH via `Promise.all()`
- Query routing: exact/prefix/tag → SQLite, semantic → AgentDB, hybrid → both merged

### Embedding generator (CRITICAL — without this, semantic search is broken)

`HybridBackend.querySemantic()` (hybrid-backend.js:216) does:
```javascript
let embedding = query.embedding;
if (!embedding && query.content && this.config.embeddingGenerator) {
    embedding = await this.config.embeddingGenerator(query.content);
}
if (!embedding) {
    throw new Error('SemanticQuery requires either content or embedding');
}
```

Similarly, `AgentDBBackend.store()` (agentdb-backend.js:142) only generates
embeddings when `this.config.embeddingGenerator` is set. Without it:
- `store()` writes entries **without embeddings** — HNSW index stays empty
- `querySemantic()` **throws** on every call — no embedding to search with

The existing `memory-initializer.js` already has a full embedding pipeline:
- `loadEmbeddingModel()` at lines 1160-1254: lazy-loads ONNX via `@xenova/transformers`,
  falls back to hash-based embeddings (never returns null — always succeeds)
- `generateEmbedding(text)` at lines 1259-1287: public function that calls
  `loadEmbeddingModel()` on first use, returns `{ embedding: number[], dimensions, model }`

**CRITICAL type constraint**: `HybridBackendConfig.embeddingGenerator` expects:
```typescript
type EmbeddingGenerator = (content: string) => Promise<Float32Array>;
```

The existing `generateEmbedding()` returns `{ embedding: number[], ... }` (an object
with a number array). We need a thin wrapper that:
1. Calls the existing function (inherits lazy loading, config, fallbacks)
2. Returns `Float32Array` (not `number[]` — `AgentDBBackend.storeInAgentDB()` at
   line 505 does `Buffer.from(entry.embedding.buffer)` which requires a typed array;
   plain `number[]` has no `.buffer` property → `TypeError`)
3. Never returns `null` (HybridBackend.querySemantic() throws on null embedding)

```javascript
// Wrap the existing generateEmbedding() — DO NOT capture raw pipeline
const embeddingGeneratorForHybrid = async (text) => {
  const result = await generateEmbedding(text);  // existing function, never fails
  return new Float32Array(result.embedding);      // must be Float32Array, not number[]
};
```

Then pass to config: `embeddingGenerator: embeddingGeneratorForHybrid`

This reuses ALL existing infrastructure (lazy ONNX loading, embeddings.json config,
EM-001/EM-002 patches, hash fallback). No new model loading code needed.

**For Task 4**: The hook script runs as a standalone process (not inside
memory-initializer.js). It cannot reuse the MCP server's module-level singleton.
It must independently load `@xenova/transformers` or skip embeddings for import/sync
operations. Since `AutoMemoryBridge.importFromAutoMemory()` calls `bulkInsert()` which
passes entries through `AgentDBBackend.store()` → `embeddingGenerator`, the hook
needs its own generator. Options:
(a) Import `@xenova/transformers` directly in the hook (adds ~500ms startup)
(b) Skip embeddingGenerator in the hook (import/sync without new embeddings —
    the MCP server generates them on next access)
Option (b) is simpler for v1 — the hook's primary job is file I/O, not embedding.

### Concurrent access (CRITICAL — SQLITE_BUSY crashes)

Task 2 (MCP server) and Task 4 (hook script) both open `.swarm/hybrid-memory.db`
via separate `better-sqlite3` connections. `better-sqlite3` is synchronous and
has NO default busy timeout. If both processes write simultaneously:
`SQLITE_BUSY` → immediate crash.

`SQLiteBackend` enables WAL mode (sqlite-backend.js:59-61) which allows concurrent
readers, but two writers still collide without a busy timeout.

**Fix**: After `backend.initialize()`, set busy timeout on BOTH SQLite connections
(SQLiteBackend and AgentDB each open their own `.db` file):
```javascript
// After backend.initialize() — set busy_timeout on BOTH database connections
// SQLiteBackend connection (.swarm/hybrid-memory.db)
const sqliteBackend = backend.getSQLiteBackend();  // public accessor method
if (sqliteBackend && sqliteBackend.db) {
  sqliteBackend.db.pragma('busy_timeout = 5000');
}
// AgentDB connection (.swarm/agentdb-memory.db) — may use sql.js (no .pragma())
try {
  const agentdbBackend = backend.getAgentDBBackend();
  const agentDbHandle = agentdbBackend?.getAgentDB()?.database;
  if (agentDbHandle && typeof agentDbHandle.pragma === 'function') {
    agentDbHandle.pragma('busy_timeout = 5000');  // better-sqlite3 only
  }
} catch {}  // AgentDB may not be initialized yet or may use sql.js
```

Note: `getSQLiteBackend()` and `getAgentDBBackend()` are public accessor methods
on HybridBackend (hybrid-backend.js:508-513). Using these instead of direct
`backend.sqlite` access avoids relying on TS-private property names.

Both Task 2 and Task 4 must set this pragma on SQLiteBackend connections.
AgentDB connections cannot have busy_timeout set (ALLOWED_PRAGMAS whitelist).
5 seconds is generous — the hook script's entire lifetime is ~500ms.

### MCP server shutdown handler (R4 #43)

The MCP server holds a `hybridBackend` instance with open SQLite connections (both
SQLiteBackend and AgentDB). When the MCP server process exits (SIGTERM/SIGINT),
these connections should be closed cleanly to flush WAL and avoid corruption.

**Add to WM-001a**: Register a process exit handler after `hybridBackend.initialize()`:
```javascript
// Clean shutdown — flush WAL, close connections
const shutdownHybrid = async () => {
  try { await hybridBackend.shutdown(); } catch {}
};
process.on('beforeExit', shutdownHybrid);
process.on('SIGTERM', () => { shutdownHybrid().then(() => process.exit(0)); });
process.on('SIGINT', () => { shutdownHybrid().then(() => process.exit(0)); });
```

This is defensive — SQLite with WAL mode is crash-safe, but clean shutdown is
best practice. The handler is lightweight (single async call).

**Risk: better-sqlite3 failure cascade:**
- `SQLiteBackend` has `import Database from 'better-sqlite3'` as a **static** top-level import
- If native bindings unavailable → entire `sqlite-backend.js` module fails to load
- This propagates: `hybrid-backend.js` imports `SQLiteBackend` statically
- Result: `await import('@claude-flow/memory')` may FAIL on platforms without working better-sqlite3
- Mitigation: our patch wraps the import in try/catch → falls back to current sql.js monolith
- Note: better-sqlite3 IS installed in the npx cache (pulled by ruv-swarm) and
  works on current system. RS-001 patch fixes Node 24 compatibility.

### Config consumption

**Current state**: No code reads memory backend config at runtime.
- `config-adapter.js::normalizeMemoryBackend()` is a pure string validator
  (`'hybrid'|'sqlite'|'agentdb'|'memory'` → passthrough, `'redis'` → `'memory'`,
  anything else → `'hybrid'`). It reads no files and no env vars.
- `CLAUDE_FLOW_MEMORY_BACKEND` is written into `.mcp.json` env block at init time
  (`mcp-generator.js:45`), so it IS available in `process.env` when the MCP server
  starts via Claude Code — but nothing reads it.
- `config.yaml` is only read by `commands/config.js::readYamlConfig()` for display
  (`config get/export`). This is a hand-rolled single-level YAML parser (no npm yaml).
- `embeddings.json` is read by `memory-initializer.js` for ONNX model + HNSW dims.

**What we add to `initializeMemoryDatabase()`**:

**CRITICAL (R4-2)**: The function destructures `backend` from `options` at line 898
as `const { backend = 'hybrid', ... } = options;`. Since `backend` is `const`,
it CANNOT be reassigned — doing so throws `TypeError: Assignment to constant variable`.
We must use a NEW variable name `backendChoice`:

```javascript
// CANNOT reassign `backend` (it's const-destructured at line 898).
// Create a new variable for the resolved backend choice.
let backendChoice = backend;  // start with the options value (usually 'hybrid')

// 1. Env var takes priority (set in .mcp.json env block by init)
if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
  backendChoice = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
}

// 2. Fall back to config.yaml memory.backend if no env var and options didn't specify
if (backendChoice === 'hybrid') {  // still at default — check config.yaml
  try {
    const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      // Match `backend:` only under `memory:` section
      // Use [\s\S] to handle blank lines between memory: and backend:
      const memSection = content.match(/^memory:\s*\n((?:[ \t]*.*\n)*?(?=^\S|\Z))/m);
      if (memSection) {
        const backendMatch = memSection[1].match(/^\s+backend:\s*(\S+)/m);
        if (backendMatch) backendChoice = backendMatch[1].replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}

// 3. Normalize (reuse config-adapter pattern)
backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
  ? backendChoice : 'hybrid';
```

**All subsequent code in WM-001 uses `backendChoice`** (not `backend`) for branching.
The original `backend` variable from `options` is untouched.

Config reading priority:
1. `CLAUDE_FLOW_MEMORY_BACKEND` env var (set in `.mcp.json` env block by init)
2. `.claude-flow/config.yaml` → `memory.backend` (project config)
3. Default: `'hybrid'` (per ADR-009)

### Fix

**Patch ops on `memory/memory-initializer.js`** (path var: `MI`):

1. **WM-001a**: At the top of `initializeMemoryDatabase()` (~line 897), add a
   branch that tries to import `@claude-flow/memory` and instantiate
   `HybridBackend` based on config:
   - Read backend choice: `process.env.CLAUDE_FLOW_MEMORY_BACKEND` → config.yaml
     `memory.backend` → `'hybrid'` default (see Config consumption section above)
   - Read HNSW toggle + dims from `embeddings.json` (existing code already does this)
   - Import `HybridBackend` from `@claude-flow/memory` (root export)
   - Build `HybridBackendConfig` based on `backendChoice` (note correct field names:
     `sqlite.databasePath`, `agentdb.dbPath`, always include `embeddingGenerator`):
     - `'hybrid'` (default) → `{ sqlite: { databasePath: dbPath }, agentdb: { dbPath: agentDbPath, vectorDimension: modelDimensions, indexType: enableHNSW ? 'hnsw' : 'flat' }, embeddingGenerator: embeddingGeneratorForHybrid, dualWrite: true }`
     - `'agentdb'` → `{ agentdb: { dbPath: agentDbPath, vectorDimension: modelDimensions, indexType: 'hnsw' }, embeddingGenerator: embeddingGeneratorForHybrid, dualWrite: false }`
     - `'sqlite'` → `{ sqlite: { databasePath: dbPath }, embeddingGenerator: embeddingGeneratorForHybrid, dualWrite: false, routingStrategy: 'sqlite-first' }`
     - `'memory'` → `{ embeddingGenerator: embeddingGeneratorForHybrid, dualWrite: false }` (in-memory defaults)
   - `const hybridBackend = new HybridBackend(config)` (named `hybridBackend` to avoid shadowing `const backend`)
   - `await hybridBackend.initialize()`
   - After `backend.initialize()`, set `PRAGMA busy_timeout = 5000` on both
     SQLite connections (SQLiteBackend and AgentDB) for concurrent access safety
   - On import/init failure → **ERROR** with fix command. Always fail loud.
     No silent fallback. Users who explicitly want WASM SQLite should set
     `backend: sqljs` in config.
   - If `backendChoice === 'sqljs'` → import `SqlJsBackend` from `@claude-flow/memory`
     (exported from root, confirmed). Use directly — explicit choice, no native deps needed.
   - If `backendChoice === 'memory'` → use in-memory Map (explicit choice, data lost on exit)

2. **WM-001b**: Create adapter functions that wrap `HybridBackend` to match the
   existing `storeEntry/searchEntries/listEntries/getEntry/deleteEntry` signatures.
   See API compatibility table above for the exact mapping. Each adapter is 10-20
   lines. Key mapping decisions:
   - **All adapters**: Translate `namespace === 'all'` → `undefined` (cross-namespace wildcard)
   - `storeEntry` uses `createDefaultEntry()` from `@claude-flow/memory` for
     all MemoryEntry defaults. Overrides: `namespace`, `key`, `content` (from `value`),
     `tags`. For upsert: `getByKey()` first, then `update()` (preserves original ID)
     or `store()` (new entry).
   - `searchEntries` calls `hybridBackend.querySemantic({content: query, ...})`.
     **Keyword fallback**: if semantic returns 0 results, falls back to
     `hybridBackend.query({type: 'structured'})` with LIKE filter. This preserves
     existing behavior from monolith lines 1672-1678.
   - `listEntries` calls `hybridBackend.query({type: 'structured'})` — MUST pass
     `type: 'structured'` to force SQLite routing (offset works correctly).
   - `getEntry` calls `hybridBackend.getByKey(namespace, key)`.
   - `deleteEntry` looks up by key+namespace first, then `hybridBackend.delete(entry.id)`.
   - **Also import `createDefaultEntry`**: `const { HybridBackend, createDefaultEntry } = await import('@claude-flow/memory');`

3. **WM-001c**: Build `HybridBackendConfig` from config sources:
   ```javascript
   // Use SEPARATE db path to avoid schema conflict with existing .swarm/memory.db
   const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
   const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');
   const hybridConfig = {
     sqlite: { databasePath: hybridDbPath },                  // MUST be databasePath, NOT path
     agentdb: {
       dbPath: agentDbPath,                                   // MUST be dbPath, NOT path
       vectorDimension: modelDimensions,                      // from loadEmbeddingModel() — NOT agentdb default 1536
       indexType: enableHNSW ? 'hnsw' : 'flat',              // from config.yaml
     },
     embeddingGenerator: embeddingGeneratorForHybrid,          // Float32Array wrapper — see WM-001e
     dualWrite: backendChoice === 'hybrid',                    // only dual-write in hybrid mode
     defaultNamespace: 'default',
     semanticThreshold: 0.7,
   };
   ```
   Note: separate DB files avoid corrupting existing `.swarm/memory.db` (different schema).

4. **WM-001d**: After `hybridBackend.initialize()`, set busy timeout on SQLite connections:
   ```javascript
   // Prevent SQLITE_BUSY when hook script and MCP server write simultaneously
   const sqliteBackend = hybridBackend.getSQLiteBackend();
   if (sqliteBackend && sqliteBackend.db) {
     sqliteBackend.db.pragma('busy_timeout = 5000');
   }
   // AgentDB connection — CRITICAL (R4 #39): AgentDB's input-validation.js has an
   // ALLOWED_PRAGMAS whitelist (lines 50-61) that does NOT include busy_timeout.
   // Calling .pragma('busy_timeout = 5000') throws ValidationError (silently caught).
   // Workaround: access the raw better-sqlite3 Database handle BEFORE AgentDB wraps it,
   // or accept the risk. Since the hook script lifetime is ~500ms and MCP server writes
   // are infrequent, SQLITE_BUSY on the AgentDB .db file is unlikely in practice.
   // For v1: set on SQLiteBackend only (guaranteed to work). Document the AgentDB gap.
   // Future: upstream PR to add busy_timeout to ALLOWED_PRAGMAS.
   ```

   **AgentDB PRAGMA limitation**: `agentdb/dist/src/security/input-validation.js`
   lines 50-61 define `ALLOWED_PRAGMAS = ['journal_mode', 'synchronous', 'cache_size',
   'temp_store', 'mmap_size', 'page_size', 'auto_vacuum', 'wal_autocheckpoint']`.
   `busy_timeout` is NOT in this list. Any `.pragma('busy_timeout = ...')` call on
   an AgentDB-managed connection throws `ValidationError`. The try/catch silently
   swallows this, leaving AgentDB's connection unprotected.

   **Risk assessment**: The MCP server and hook script use SEPARATE `.db` files for
   AgentDB (`agentdb-memory.db`). The hook's lifetime is ~500ms. Concurrent writes
   to the AgentDB file are rare. SQLiteBackend's `hybrid-memory.db` handles the
   majority of writes (dual-write means both get written, but SQLiteBackend has
   busy_timeout protection). Acceptable risk for v1.

5. **WM-001e**: Create the `embeddingGeneratorForHybrid` wrapper + pre-load model:
   ```javascript
   // BEFORE constructing HybridBackendConfig:
   // 1. Pre-load the embedding model to get correct dimensions
   // GUARD (R4 R4-7/R4 #42): loadEmbeddingModel() can fail (catch at line 1246
   // sets state fields). If it fails, embeddingModelState may have null dimensions.
   // The || 384 fallback handles this, and the hash fallback in generateEmbedding()
   // ensures the wrapper never crashes.
   await loadEmbeddingModel();  // existing function at line 1160, lazy + idempotent
   const modelDimensions = (embeddingModelState && embeddingModelState.dimensions) || 384;

   // 2. Create Float32Array wrapper (HybridBackend expects Float32Array, not number[])
   const embeddingGeneratorForHybrid = async (text) => {
     const result = await generateEmbedding(text);  // existing function at line 1259
     // generateEmbedding always succeeds (hash fallback at lines 1232-1244)
     return new Float32Array(result.embedding);
   };

   // 3. Pass modelDimensions to agentdb config to avoid dimension mismatch
   //    (AgentDB defaults to 1536 if not specified; actual model may be 384)
   ```
   Also fold `memory.learningBridge.enabled` and `memory.memoryGraph.enabled` config
   reads into the HybridBackendConfig construction (originally WM-002d/e — see
   Task 3 restructuring below).

   **Note on agentdb `vectorDimension`**: `AgentDBBackendConfig` defaults to 1536
   dimensions (agentdb-backend.js:42). The actual ONNX model produces 384 (MiniLM)
   or 768 (mpnet). Pass `modelDimensions` as `agentdb.vectorDimension` to prevent
   HNSW index mismatch.

### Dependencies and risks

- `@claude-flow/memory` in CLI's `optionalDependencies` (present in npx cache)
- `agentdb@2.0.0-alpha.3.7` is a regular dependency of `@claude-flow/memory`
- `better-sqlite3@^11.0.0` is an optional dependency of `@claude-flow/memory`
  AND `^11.8.1` optional dependency of `agentdb`
- `better-sqlite3` IS installed in npx cache (pulled by `ruv-swarm` as a hard dep)
- RS-001 patches better-sqlite3 for Node 24 but only in ruv-swarm's package.json

**Failure modes — fail loud, no silent fallback:**

| Failure | What happens | User sees |
|---------|-------------|-----------|
| `import('@claude-flow/memory')` throws | better-sqlite3 static import crashes | ERROR: `@claude-flow/memory not loadable — better-sqlite3 native bindings missing. Run: npx @claude-flow/cli doctor --install` |
| `HybridBackend.initialize()` throws | AgentDBBackend can't import agentdb | ERROR: `AgentDB backend unavailable. Run: npx @claude-flow/cli doctor --install` |
| better-sqlite3 not compiled (Node 24) | SQLiteBackend can't create Database | ERROR: `better-sqlite3 needs rebuild for Node ${version}. Run: npx @claude-flow/cli doctor --install` |
| Config says `backend: hybrid` but deps missing | Mismatch | ERROR: `Config requires hybrid backend but dependencies unavailable. Either fix deps or change backend to 'sqljs'.` |
| Config says `backend: sqljs` | No native deps needed | Works — user explicitly chose this, no degradation |

**No `try/catch → fall through to sql.js monolith`.** If the configured backend
can't load, the operation fails with a clear error. The ONLY exception: `doctor`
and `init` always work (they diagnose, they don't need the memory backend).

**Schema coexistence**: HybridBackend uses a different schema than
memory-initializer.js, so it uses SEPARATE database files (`.swarm/hybrid-memory.db`
+ `.swarm/agentdb-memory.db`). Clean wipe — old `.swarm/memory.db` can be deleted.

### Design philosophy: Fail loud, fail fast — no silent fallbacks

**Config is a contract, not a suggestion.** If config says `backend: hybrid`,
the runtime MUST deliver hybrid or ERROR with a clear message and fix command.
Never silently degrade to sql.js.

**Backend options become explicit choices:**

| Config value | What it requires | What user gets |
|-------------|-----------------|----------------|
| `hybrid` (default) | better-sqlite3 + agentdb | Dual SQLite+AgentDB with auto-routing |
| `sqlite` | better-sqlite3 | Native SQLite only |
| `sqljs` | (nothing native) | WASM SQLite only — explicitly chosen, not a hidden fallback |
| `memory` | (nothing native) | In-memory only — data lost on exit, explicitly chosen |

**Always fail loud — no `runtime.strict` flag needed for v1.**

Earlier iterations proposed a `runtime.strict` / `--use-fallbacks` mechanism.
Swarm review found this was unimplemented: no code writes `runtime.strict` to
config.yaml, no code reads it, and the `strict` variable in Task 4's hook code
was unbound. For v1, we simplify to always-fail-loud:

- If the configured backend can't load → **ERROR** with fix command. Stop.
- Users who want WASM-only SQLite set `backend: sqljs` explicitly.
- `doctor --install` attempts to resolve native dependency issues.
- `--use-fallbacks` can be added in a future iteration if demand warrants it.

**Error handling rules:**
1. Feature-level failure, not tool-level — `memory store` errors, but `doctor`/`init` always work
2. Error message includes exact fix command: `Run: npx @claude-flow/cli doctor --install`
3. Error message includes escape hatch: `Or change config to: backend: sqljs`
4. `memory status` ALWAYS shows which backend is actually active + configured vs actual
5. `doctor` checks intended vs actual backend, warns on mismatch
6. `init` wizard pre-checks available backends, only offers what works on the system

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `memory/memory-initializer.js` | `MI` | WM-001a: backend branching + WM-001b: adapter + WM-001c: config passthrough |

### Upstream alignment

- Directly implements ADR-006 (Unified Memory Service) intent
- Directly implements ADR-009 (Hybrid Memory Backend) config consumption
- Unblocks ADR-048 Phase 2 (AutoMemoryBridge hooks integration)
- Addresses root cause of #829 (AgentDB integration plan)
- Bypasses bugs #1041, #949, #1030 in the sql.js monolith
- Respects `CLAUDE_FLOW_MEMORY_BACKEND` env var (already set in `.mcp.json` by init, but never read until now)

### Verification

- `memory_store` MCP tool works with hybrid backend
- `memory_search` returns results with HNSW vector similarity
- `CLAUDE_FLOW_MEMORY_BACKEND=agentdb` overrides config.yaml
- Config `backend: hybrid` + missing deps → clear ERROR with `doctor --install` hint + `backend: sqljs` escape hatch
- Config `backend: sqljs` → works without native deps (explicit choice)
- `memory status` shows actual backend name
- `bash check-patches.sh` passes
- `npm test` passes

---

## Task 3: Neural Config Gating (new defect WM-002)

### Restructured after swarm review

Original WM-002 had 5 sub-items (a–e). Swarm review found:
- **WM-002a/b**: Already handled by Task 2 (WM-001a/c). Confirmed.
- **WM-002d/e**: Patch code that WM-001 *injects* — extremely brittle (old_string
  comes from another patch's new_string). **Folded into WM-001e** instead.
- **GitHub issue conflict**: Plan originally said "comment on #1142", but CF-002
  already owns #1142. Violates one-defect-per-issue rule.

**WM-002 is now scoped to WM-002c only**: neural gating in `intelligence.js`.
Needs its own new GitHub issue (not #1142).

### Problem

`neural.enabled` is written to config.yaml by the wizard (executor.js) but never
read at runtime. `initializeIntelligence()` in `memory/intelligence.js`
always runs regardless of config.

### Fix

**Depends on Task 2** — needs config reading infrastructure.

1. **WM-002c**: Read `neural.enabled` from config.yaml (same pattern as WM-001a).
   When false, skip `initializeIntelligence()` in `memory/intelligence.js`.

   **CRITICAL (R4 R4-6)**: When gating out, MUST still set
   `intelligenceInitialized = true` (the module-level flag). Multiple callers
   check this flag and will re-invoke `initializeIntelligence()` in a loop if
   it stays `false`. The gating code must be:
   ```javascript
   // At top of initializeIntelligence():
   if (!neuralEnabled) {
     intelligenceInitialized = true;  // MUST set — callers check this flag
     return;  // skip all neural initialization
   }
   ```

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `memory/intelligence.js` | `INTEL` (new path var) | WM-002c: neural gating |

### New path variable

Add to `lib/common.py`:
```python
INTEL = memory + "/intelligence.js" if memory else ""
```

### Upstream alignment

- Matches ADR-006 config-driven feature gating
- Needs NEW GitHub issue (not #1142 — that belongs to CF-002)
- Matches #1143 (config values should control runtime behavior)

### Verification

- Set `neural.enabled: false` → verify neural patterns disabled
- Set `neural.enabled: true` (default) → verify neural works as before

---

## Task 4: Activate AutoMemoryBridge (new defect WM-003)

### Problem

ADR-048 specifies bidirectional sync between Claude Code auto-memory
(`~/.claude/projects/<project>/memory/`) and AgentDB + HNSW. The implementation
exists — `AutoMemoryBridge` in `@claude-flow/memory` (883 lines, 58 tests) — but
the CLI's generated `auto-memory-hook.mjs` is a stub that detects the package
but doesn't use it.

The hook at `helpers-generator.js:805-817` does:
```javascript
let memPkg = null;
try { memPkg = await import('@claude-flow/memory'); } catch {}
if (!memPkg || !memPkg.AutoMemoryBridge) {
    dim('Memory package not available — auto memory import skipped');
    return;
}
dim('Auto memory import available — run init --upgrade for full support');
// ← ends here, never actually calls AutoMemoryBridge
```

The settings.json hooks are already wired:
- SessionStart → `node .claude/helpers/auto-memory-hook.mjs import` (executor.js:257-258)
- SessionEnd → `node .claude/helpers/auto-memory-hook.mjs sync` (executor.js:260-261)

So the hook runs, imports the package successfully, finds `AutoMemoryBridge`,
then does nothing. The scaffolding is complete — only the implementation is missing.

### AutoMemoryBridge API (from auto-memory-bridge.d.ts)

Constructor: `new AutoMemoryBridge(backend: IMemoryBackend, config?: AutoMemoryBridgeConfig)`

| Method | When to Call | What it Does |
|--------|-------------|-------------|
| `importFromAutoMemory()` | SessionStart | Reads `~/.claude/projects/<project>/memory/*.md`, parses entries, bulk-inserts into AgentDB with embeddings. Returns `{imported, skipped, files, durationMs}` |
| `syncToAutoMemory()` | SessionEnd | Queries high-confidence AgentDB entries, writes to MEMORY.md + topic files, curates index to stay under 200-line limit. Returns `{synced, categories, durationMs, errors}` |
| `recordInsight(insight)` | During session (post-task hooks) | Stores insight in AgentDB + optionally writes to files immediately |
| `curateIndex()` | After sync | Prunes MEMORY.md by confidence-weighted strategy |
| `getStatus()` | Status check | Returns dir info, file count, line counts, buffered insights |
| `destroy()` | Cleanup | Stops periodic sync timer |

Config: `AutoMemoryBridgeConfig`
- `workingDir` — for git root detection (auto-resolves memory dir)
- `maxIndexLines: 180` — MEMORY.md limit (Claude reads first 200)
- `syncMode: 'on-session-end'` — when syncs occur
- `minConfidence: 0.7` — threshold for syncing to auto memory
- `pruneStrategy: 'confidence-weighted'` — how to keep under line limit
- `learning?: LearningBridgeConfig` — optional ADR-049 integration
- `graph?: MemoryGraphConfig` — optional knowledge graph curation

### Fix

**Depends on Tasks 2+3** — needs `@claude-flow/memory` wired in and config respected.

**Target file**: `init/helpers-generator.js` (path var: `HELPERS_GEN`)

**CRITICAL — Template literal escaping (R4 #39 Agent 2)**: The `generateAutoMemoryHook()`
function at line 776 returns a template literal (backtick string). ALL replacement
code injected into this template MUST use `\${...}` (escaped) not `${...}` (which
would be evaluated at generation time, not at hook runtime). In the `fix.py` Python
source, this appears as `\\$\{...\}` inside triple-quoted strings. This applies to
ALL code blocks below — `result.imported`, `result.durationMs`, `result.synced`, etc.

**Patch ops**:

1. **WM-003a**: Replace the `doImport()` stub with actual `AutoMemoryBridge` usage:
   ```javascript
   async function doImport() {
     let memPkg;
     try { memPkg = await import('@claude-flow/memory'); } catch (e) {
       console.error('[AutoMemory] ERROR: @claude-flow/memory not loadable:', e.message);
       console.error('[AutoMemory] Run: npx @claude-flow/cli doctor --install');
       console.error('[AutoMemory] Or set backend: sqljs in config.yaml');
       process.exit(1);
     }
     const { HybridBackend, AutoMemoryBridge } = memPkg;
     const backend = new HybridBackend({
       sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
       agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
       dualWrite: true,
       // No embeddingGenerator for v1 — hook does file I/O only.
       // LIMITATION: Entries imported without embeddingGenerator have NO embeddings.
       // They are searchable by exact/prefix/tag (SQLite) but INVISIBLE to semantic
       // search (AgentDB HNSW) until re-stored through MCP tools with embeddings.
       // This is acceptable for v1 — auto-memory files are small text, and the MCP
       // server generates embeddings when entries are accessed/updated.
     });
     await backend.initialize();
     // Set busy_timeout on SQLiteBackend connection
     // NOTE: AgentDB ALLOWED_PRAGMAS whitelist blocks busy_timeout (R4 #39)
     const sqlBe = backend.getSQLiteBackend();
     if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
     const bridge = new AutoMemoryBridge(backend, {
       workingDir: PROJECT_ROOT,
       syncMode: 'on-session-end',
       minConfidence: 0.7,
     });
     const result = await bridge.importFromAutoMemory();
     if (result.imported > 0) {
       // NOTE: In fix.py, these ${} must be escaped as \${} inside the template literal
       dim(`Imported ${result.imported} entries from auto memory (${result.durationMs}ms)`);
     }
     await backend.shutdown();
   }
   ```

2. **WM-003b**: Replace the `doSync()` stub with actual sync:
   ```javascript
   async function doSync() {
     let memPkg;
     try { memPkg = await import('@claude-flow/memory'); } catch (e) {
       console.error('[AutoMemory] ERROR: @claude-flow/memory not loadable:', e.message);
       console.error('[AutoMemory] Run: npx @claude-flow/cli doctor --install');
       process.exit(1);
     }
     const { HybridBackend, AutoMemoryBridge } = memPkg;
     const backend = new HybridBackend({
       sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
       agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
       dualWrite: true,
       // No embeddingGenerator — sync reads existing entries and writes to files.
       // Same limitation as doImport: no new embeddings generated by the hook.
     });
     await backend.initialize();
     // Set busy_timeout on SQLiteBackend connection
     // NOTE: AgentDB ALLOWED_PRAGMAS whitelist blocks busy_timeout (R4 #39)
     const sqlBe = backend.getSQLiteBackend();
     if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
     const bridge = new AutoMemoryBridge(backend, {
       workingDir: PROJECT_ROOT,
       syncMode: 'on-session-end',
       minConfidence: 0.7,
     });
     const result = await bridge.syncToAutoMemory();
     if (result.synced > 0) {
       // NOTE: In fix.py, these ${} must be escaped as \${} inside the template literal
       dim(`Synced ${result.synced} entries to auto memory (${result.durationMs}ms)`);
     }
     await backend.shutdown();
   }
   ```

3. **WM-003c**: Update `doStatus()` to show real bridge status when available.

### Note on backend choice

Task 4 uses `HybridBackend` (not `AgentDBAdapter`) because:
1. `HybridBackend` implements `IMemoryBackend` — what `AutoMemoryBridge` requires
2. `HybridBackend` gives us dual-write (SQLite + AgentDB) for the same DB file
3. Consistent with Task 2 which also uses `HybridBackend`

Since `auto-memory-hook.mjs` runs as a standalone script (not within the MCP
server process), it creates its own backend instance. Both Task 2 and Task 4
use the same `.swarm/hybrid-memory.db` and `.swarm/agentdb-memory.db` paths,
so data written by MCP tools (Task 2) is visible to the bridge (Task 4) and
vice versa. Both processes set `busy_timeout = 5000` on the SQLiteBackend connection.
AgentDB's connection cannot have `busy_timeout` set (ALLOWED_PRAGMAS whitelist).

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `init/helpers-generator.js` | `HELPERS_GEN` | WM-003a: doImport, WM-003b: doSync, WM-003c: doStatus |

### Upstream alignment

- Directly implements ADR-048 Phases 2-3 (hooks + CLI integration)
- GitHub issue: #1102
- The hook scaffolding (settings.json SessionStart/SessionEnd entries) already
  exists from executor.js:257-282 — this patch makes them functional
- `AutoMemoryBridge` constructor takes `IMemoryBackend` + config, which
  `HybridBackend` satisfies (verified: `class HybridBackend implements IMemoryBackend`)

### Verification

- On session start: `auto-memory-hook.mjs import` reads MEMORY.md + topic files,
  imports entries into `.swarm/hybrid-memory.db` + `.swarm/agentdb-memory.db`
- On session end: `auto-memory-hook.mjs sync` writes high-confidence entries
  back to MEMORY.md + topic files
- `auto-memory-hook.mjs status` shows real file counts and sync times
- MEMORY.md stays under 200 lines after curation
- Missing `@claude-flow/memory` → clear ERROR with fix command (not silent skip)

---

## Task 5: Make `doctor --install` Resolve Native Deps (new defect CF-003)

### Problem

Error messages from Task 2 tell users to run `npx @claude-flow/cli doctor --fix`,
but `doctor --fix` only **displays text suggestions** — it does NOT execute any
fixes. The `--install` flag is the actual auto-fix trigger (currently only handles
Claude Code CLI installation).

**Current `doctor.js` behavior:**
- `--fix` (line 430): `const showFix = ctx.flags.fix` — shows fix suggestion *text*
- `--install` (line 431): `const autoInstall = ctx.flags.install` — executes auto-fixes
- Existing checks: `checkVersionFreshness`, `checkNodeVersion`, `checkNpmVersion`,
  `checkClaudeCode`, `checkGit`, `checkGitRepo`, `checkConfigFile`, `checkDaemonStatus`,
  `checkMemoryDatabase`, `checkApiKeys`, `checkMcpServers`, `checkDiskSpace`, `checkBuildTools`
- `checkMemoryDatabase` (lines 103-122): only checks `.db` file existence, not backend
- `execSync` already imported (line 10)

### Fix

**Target file**: `commands/doctor.js` (path var: `DOC`)

**Patch ops**:

1. **CF-003a**: Add a new `checkMemoryBackend()` diagnostic function that:
   - Reads `CLAUDE_FLOW_MEMORY_BACKEND` env var and config.yaml `memory.backend`
   - Tries `require.resolve('better-sqlite3')`, `require.resolve('agentdb')`,
     `require.resolve('@claude-flow/memory')`
   - Reports configured vs actual backend availability
   - Flags mismatch (e.g. `backend: hybrid` but better-sqlite3 missing)
   - Adds fix suggestion text: `npm rebuild better-sqlite3`

2. **CF-003b**: Extend the `--install` path (not `--fix`) to auto-resolve native deps:
   - After the existing Claude Code CLI install block (lines 508-527), add:
   - If `checkMemoryBackend` failed and `autoInstall` is true:
     - Run `npx node-gyp rebuild` in the better-sqlite3 package directory
       (safer than broad `npm rebuild` — targets only the specific package)
     - Re-check after rebuild, report success/failure
   - Also update error messages in Task 2 (WM-001) to say `doctor --install`
     instead of `doctor --fix`

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `commands/doctor.js` | `DOC` | CF-003a: memory backend check, CF-003b: --install auto-fix |

### Verification

- `doctor` shows memory backend diagnostic (configured vs actual)
- `doctor --install` with broken better-sqlite3 → attempts rebuild
- `doctor --install` with working deps → reports all OK
- `doctor --fix` shows text suggestions (unchanged behavior)

---

## Task 6: Add `node --check` Syntax Validation to Sentinel

### Problem

Patch-apply tests only verify string replacement (textual). A malformed JS string
in `fix.py` could pass all tests but crash at runtime. `node --check` parses
without executing — catches syntax errors in generated JS.

### Fix

**Target file**: `check-patches.sh`

**Changes**:

1. After all sentinel directives pass, run `node --check` on each patched JS file
   to verify syntax validity. **Must run inside the existing `INSTALLS` loop** (R4 #42)
   — uses `$dist_src` (line 149) not `$BASE`. Runs for EACH install, not just one.
   Files to check per install:
   - `node --check $dist_src/memory/memory-initializer.js`
   - `node --check $dist_src/commands/init.js`
   - `node --check $dist_src/memory/intelligence.js`
   - `node --check $dist_src/init/helpers-generator.js`
   - `node --check $dist_src/commands/doctor.js`
2. Report "SYNTAX OK: <file>" or "SYNTAX ERROR: <file>" with the node error output

This catches broken template literals, unmatched braces, and other JS syntax
issues that string-match tests cannot detect.

### Files

| File | What changes |
|------|-------------|
| `check-patches.sh` | Add `node --check` step after sentinel verification |

### Verification

- Intentionally break a patch string → `check-patches.sh` catches it
- All patches applied correctly → "SYNTAX OK" for all files

---

## Execution Order

```
Task 1 (SG-006) ─── independent, ships first (simple fix)
Task 2 (WM-001) ─── independent of Task 1, core wiring work
Task 3 (WM-002) ─── depends on Task 2
Task 4 (WM-003) ─── depends on Tasks 2+3, activates ADR-048
Task 5 (CF-003) ─── depends on Task 2 (must know what backends to check)
Task 6 (syntax) ─── independent, enhances check-patches.sh
```

## New Category

| Prefix | Category |
|--------|----------|
| WM | Wiring / Memory Integration |

Add to `lib/categories.json`.

## Files Modified Summary

| File | Task | Action |
|------|------|--------|
| `patch/340-SG-006-wizard-capture/README.md` | 1 | New |
| `patch/340-SG-006-wizard-capture/fix.py` | 1 | New |
| `patch/340-SG-006-wizard-capture/sentinel` | 1 | New |
| `patch/350-WM-001-memory-wiring/README.md` | 2 | New |
| `patch/350-WM-001-memory-wiring/fix.py` | 2 | New |
| `patch/350-WM-001-memory-wiring/sentinel` | 2 | New |
| `patch/360-WM-002-config-respect/README.md` | 3 | New |
| `patch/360-WM-002-config-respect/fix.py` | 3 | New |
| `patch/360-WM-002-config-respect/sentinel` | 3 | New |
| `patch/370-WM-003-auto-memory-bridge/README.md` | 4 | New |
| `patch/370-WM-003-auto-memory-bridge/fix.py` | 4 | New |
| `patch/370-WM-003-auto-memory-bridge/sentinel` | 4 | New |
| `patch/380-CF-003-doctor-native-deps/README.md` | 5 | New |
| `patch/380-CF-003-doctor-native-deps/fix.py` | 5 | New |
| `patch/380-CF-003-doctor-native-deps/sentinel` | 5 | New |
| `check-patches.sh` | 6 | Add `node --check` syntax validation |
| `lib/categories.json` | 2 | Add WM category |
| `tests/fixtures/` | all | Add fixture content for new patches |
| `tests/03-patch-apply.test.mjs` | all | Add test rows |
| `tests/04-idempotency.test.mjs` | all | Add test rows |

## GitHub Issues to Create/Comment

| Task | Action | Target |
|------|--------|--------|
| SG-006 | Create new issue | Wizard embeddings + permissionRequest capture bugs |
| WM-001 | Comment on #829 | Wire @claude-flow/memory into CLI per ADR-006/009 |
| WM-002 | Create new issue | neural.enabled config not consumed at runtime (NOT #1142 — CF-002 owns that) |
| WM-003 | Comment on #1102 | Activate AutoMemoryBridge (ADR-048 Phases 2-3) |
| CF-003 | Create new issue | `doctor --install` should resolve native deps (better-sqlite3, agentdb) |

## End-to-End Verification

```bash
# Apply all patches
bash patch-all.sh --global

# Idempotency
bash patch-all.sh --global  # 0 applied

# Sentinel
bash check-patches.sh

# Tests
npm test

# Functional: wizard capture (Task 1)
npx @claude-flow/cli init wizard  # select non-default embeddings
# → check embeddings.json model matches selection

# Functional: memory wiring (Task 2)
npx @claude-flow/cli memory store --key test --value "hello" --namespace test
npx @claude-flow/cli memory search --query "hello" --namespace test
# → verify backend is hybrid (not just sql.js)
# → verify .swarm/hybrid-memory.db exists (not :memory:)
# → verify semantic search returns results (embeddings generated)

# Functional: config respect (Task 3)
# Edit config.yaml: neural.enabled: false
# → verify neural patterns disabled

# Functional: concurrent access (Task 2 + Task 4)
# Start MCP server, then run auto-memory-hook.mjs import simultaneously
# → verify no SQLITE_BUSY errors

# Functional: doctor --install (Task 5)
npx @claude-flow/cli doctor --install
# → verify it checks better-sqlite3, agentdb, @claude-flow/memory
# → verify backend mismatch detection works

# Syntax validation (Task 6)
bash check-patches.sh
# → verify "SYNTAX OK" for all patched JS files
# → intentionally break a patch → verify syntax error caught
```

---

## Swarm Review Findings (2026-02-21)

Three Opus agents reviewed the plan. 22 of 23 code assumptions confirmed.
Below are all issues found, their severity, and how they were resolved.

### CRITICAL (2) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | **No `embeddingGenerator`** — `querySemantic()` throws on every call, `store()` never generates embeddings. Semantic search completely broken. | Added "Embedding generator" section to Task 2. Port existing ONNX pipeline from memory-initializer.js into `embeddingGenerator` callback. Added to all HybridBackendConfig blocks. |
| 2 | **No `busy_timeout`** — MCP server + hook script both open same DB via `better-sqlite3`. Overlapping writes → `SQLITE_BUSY` crash. | Added WM-001d (`PRAGMA busy_timeout = 5000` after init). Added to both Task 2 and Task 4 code blocks. |

### HIGH (3) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 3 | **Wrong config keys** — `sqlite: { path: ... }` should be `{ databasePath: ... }`. `agentdb` needs `{ dbPath: ... }`. Using wrong keys silently creates in-memory DBs that lose all data. | Fixed all HybridBackendConfig blocks in WM-001c, WM-003a, WM-003b. Added bold warning to HybridBackendConfig reference. |
| 4 | **`runtime.strict` unimplemented** — referenced but never written or read. `strict` var in Task 4 was unbound. | Dropped strict/fallback mechanism for v1. Always fail loud. Users who want WASM-only set `backend: sqljs` explicitly. |
| 5 | **DB path contradiction** — code said `hybrid-memory.db`, prose said `memory.db`. | Fixed all prose references to match code: `hybrid-memory.db` + `agentdb-memory.db`. |

### HIGH (2) — Structural changes

| # | Issue | Resolution |
|---|-------|-----------|
| 6 | **WM-002 GitHub issue conflict** — plan said "comment on #1142" but CF-002 already owns that issue. | WM-002 now creates its OWN new issue. Updated GitHub Issues table. |
| 7 | **WM-002d/e fragile inter-patch deps** — would patch code injected by WM-001. `old_string` from another patch's `new_string` = extremely brittle. | Folded WM-002d/e into WM-001e. WM-002 now scoped to neural gating only (WM-002c). |

### MEDIUM (3) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 8 | **Wrong SemanticQuery field** — `text` should be `content`. | Fixed in adapter mapping table and WM-001b description. |
| 9 | **Incomplete MemoryEntry** — missing NOT NULL fields (`content` not `value`, `type`, `accessLevel`, `version`, `references`, `accessCount`, `lastAccessedAt`). | Fixed in adapter mapping table. Each adapter now 10-15 lines (not 3-8). |
| 10 | **`memory-tools.js:60`** — wrong line number, should be `:70` (definition). | Fixed in architecture chain text. |

### Confirmed OK

- `sqljs` backend option: `SqlJsBackend` IS exported from root (confirmed). Code path described but not shown — acceptable for v1, since `sqljs` is a secondary choice.
- `process.cwd()` assumption: pre-existing in memory-initializer.js, not introduced by plan. Hook uses `PROJECT_ROOT` from script path.
- better-sqlite3 + sql.js coexistence: different files, different engines, no conflict.
- All Task 1 assumptions: exact line number matches for all 4 bugs.
- All Task 4 assumptions: AutoMemoryBridge constructor, methods, config all confirmed.
- Config keys: `databasePath` (SQLiteBackend) and `dbPath` (AgentDB) confirmed correct.
- busy_timeout syntax: `db.pragma('busy_timeout = 5000')` confirmed correct for better-sqlite3.

### Patch feasibility ratings (after fixes)

| Task | Rating | Notes |
|------|--------|-------|
| SG-006 | **EASY** | 3 simple patch ops, clean insertion points |
| WM-001 | **HARD** | Now 5 ops (a–e). Each exported function needs own `patch()` with NS-002-patched signatures. Largest patch in project. |
| WM-002 | **EASY** | Scoped to neural gating only. 1 patch op on new file target. |
| WM-003 | **MODERATE** | Template string escaping in Python. Clean function boundaries. |

---

## Swarm Review 2 Findings (2026-02-21)

Second review focused on validating the fixes from Review 1. Three Opus agents
checked embedding generator, busy_timeout + config keys, and overall pros/cons.

### CRITICAL (1) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 11 | **`embeddingGenerator` must return `Float32Array`** — Plan returned `number[]` via `Array.from()`. `AgentDBBackend.storeInAgentDB()` at line 505 does `Buffer.from(entry.embedding.buffer)` — `.buffer` is undefined on plain `number[]` → `TypeError` crash. Also: existing `generateEmbedding()` returns an object `{embedding, dimensions, model}`, not a raw array. | Rewrote wrapper: `const result = await generateEmbedding(text); return new Float32Array(result.embedding)`. Uses existing lazy-loading infrastructure. Never returns null. |

### HIGH (3) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 12 | **busy_timeout only on SQLiteBackend, not AgentDB** — dual-write goes to BOTH `.swarm/hybrid-memory.db` and `.swarm/agentdb-memory.db`. AgentDB's SQLite connection had no busy_timeout → SQLITE_BUSY on that file. | WM-001d sets busy_timeout on SQLiteBackend. **UPDATE (R4 #39a)**: AgentDB's `ALLOWED_PRAGMAS` whitelist blocks `busy_timeout` — cannot be set on AgentDB connection. Accepted risk for v1 (separate .db files, short hook lifetime). |
| 13 | **Null return from `embeddingGenerator` crashes `querySemantic()`** — `HybridBackend.querySemantic()` throws `'SemanticQuery requires either content or embedding'` on null. Every semantic search would crash. | Removed `return null` pattern. Existing `loadEmbeddingModel()` always succeeds (hash fallback at lines 1232-1244). Wrapper never returns null. |
| 14 | **Dimension mismatch** — `AgentDBBackendConfig` defaults `vectorDimension: 1536` but actual ONNX model is 384 (MiniLM) or 768 (mpnet). HNSW index would be misconfigured. | Added WM-001e: pre-load model via `await loadEmbeddingModel()` to get actual dimensions. Pass as `agentdb.vectorDimension: modelDimensions`. |

### MEDIUM (2) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 15 | **Wrong line references** — Plan said embedding code at lines 935-970. Actual: `loadEmbeddingModel()` at 1160-1254, `generateEmbedding()` at 1259-1287. Lines 933-1049 are sql.js database init. | Fixed all references. |
| 16 | **Task 4 hook needs own embedding pipeline** — Hook runs as standalone script, can't reuse MCP server's module-level singleton. | Decided: skip `embeddingGenerator` in hook for v1. Hook does file I/O; MCP server generates embeddings on next access. |

### Noted (not blocking, for awareness during implementation)

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 17 | **WM-001 is largest patch ever** (~200-250 lines JS in Python). SG-004 at 208 lines is current record. | Medium | Accept the cost. Use early-return branch pattern (insert at top of each function), not full function replacement, to minimize old_string size. |
| 18 | **`bulkInsert` on HybridBackend** needs verification before Task 4. If missing, `importFromAutoMemory()` crashes. | High | Verify during implementation. HybridBackend.bulkInsert() at line 285 confirmed by Review 1. |
| 19 | **No data migration** from `.swarm/memory.db` (old schema) to `hybrid-memory.db` (new). | N/A | Resolved: clean wipe and reinstall. No migration needed. Old `.swarm/memory.db` can be deleted. |
| 20 | **Default `backend: hybrid` may regress first-run experience** if better-sqlite3 is broken. Before patch: sql.js worked (buggily). After: ERROR. | Medium | The `backend: sqljs` escape hatch exists. Consider documenting prominently. `init` wizard should pre-check deps and suggest `sqljs` if native deps unavailable. |
| 21 | **`doctor --fix` is aspirational** — only shows text suggestions, doesn't execute fixes. `--install` is the auto-fix flag. | Medium | **In scope.** Task 5 (CF-003) extends `--install` to resolve native deps. Error messages updated to say `doctor --install`. |
| 22 | **No functional tests** — only textual patch-apply tests. | Medium | **In scope.** Add `node --check` on patched files in sentinel verification. Add to `check-patches.sh` post-apply step to catch syntax errors in generated JS. |
| 23 | **TS `private` property access** — `backend.sqlite.db` works at JS runtime but violates TS declarations. | Low | Mitigated: use `getSQLiteBackend()` / `getAgentDBBackend()` + `getAgentDB()` public accessors. Updated in plan. |

---

## Swarm Review 3 Findings (2026-02-21)

Third review focused on fresh plan analysis (not re-reviewing previous findings).
Three Opus agents: Tasks 1-2 code check, Tasks 3-6 code check, pros/cons/risks.

### CRITICAL (4) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 24 | **`getEntry` signature wrong** — Plan said `getEntry({id, key, namespace})` but actual is `getEntry({key, namespace})`. No `id` param. | Fixed adapter: always use `backend.getByKey(namespace, key)`. |
| 25 | **`deleteEntry` signature wrong** — Plan said `deleteEntry({id})` but actual is `deleteEntry({key, namespace})`. | Fixed adapter: lookup by key+namespace first via `getByKey()`, then `backend.delete(entry.id)`. |
| 26 | **`tags`/`metadata`/`references` types wrong** — Plan used `JSON.stringify(tags)`, `'{}'`, `'[]'`. SQLiteBackend stringifies internally. Pre-stringified = double-stringification = corrupt data. | Fixed: `tags: tags \|\| []` (array), `metadata: {}` (object), `references: []` (array). |
| 27 | **Task 3: Wrong function name** — `initializeLocalReasoningBank()` does not exist. Actual: `initializeIntelligence()` at line 403 of intelligence.js. | Fixed: replaced all references. |

### HIGH (3) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 28 | **Task 5: `--fix` misunderstanding** — `--fix` only displays text. `--install` is the auto-fix flag. | Rewrote Task 5 to extend `--install`. Updated all error messages to say `doctor --install`. |
| 29 | **`initializeMemoryDatabase` already destructures `backend`** — Line 898: `const { backend = 'hybrid', ... } = options`. Plan created second variable. | **UPDATE (R4 R4-2)**: Cannot override `const` variable. Introduced `let backendChoice = backend` as a new variable. All branching uses `backendChoice`. |
| 30 | **Task 4 semantic search gap** — Entries imported without `embeddingGenerator` are invisible to HNSW semantic search. Plan incorrectly said "MCP server generates on next access". | Fixed: documented limitation honestly in code comments. Entries searchable by SQLite (exact/tag) but not by semantic until re-stored via MCP. |

### MEDIUM (4) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| 31 | **Use `getAgentDB()` public method** instead of private `.agentdb` property. | Fixed: all references now use `getAgentDB()?.database` instead of `.agentdb.database`. |
| 32 | **`loadEmbeddingModel` can technically fail** — catch block returns `success: false`. | Noted: wrapper should guard. Hash fallback makes this unlikely in practice. |
| 33 | **Task 6: `$BASE` not a variable in check-patches.sh** — comes from `$INSTALLS` array. | Noted: implementation must extract from `$INSTALLS[0]`. |
| 34 | **Verification section references dropped `--use-fallbacks`** — leftover from pre-review. | Fixed: removed, replaced with `doctor --install` + `backend: sqljs` escape hatch. |

### MEDIUM (from Agent 3 pros/cons — noted, not blocking)

| # | Issue | Notes |
|---|-------|-------|
| 35 | **config.yaml regex matches first `backend:` anywhere** — could match wrong section. | Fixed: regex now scopes to `memory:` section via two-step match. |
| 36 | **No `@claude-flow/memory` version pinning** — API changes break patches. | Noted for implementation: add version check on import (verify known export exists). |
| 37 | **WM-001 pushes `patch()` beyond designed use case** — feature impl via patching. | Accepted: this IS the project's purpose. Use early-return pattern to minimize old_string. |
| 38 | **Plan never shows actual `old_string` values** — deferred to implementation. | Accepted: old_string depends on post-NS-002 code. Implementation must use patched signatures. |

### Confirmed OK (from all 3 agents)

- Task 1: All line numbers exact (571, 575, 577, 498, 678). All insertion points clean.
- Task 1: `enableEmbeddings` IS used via `execSync` at line 611/616 but NOT via `options`. Plan fix still valid.
- Task 2: `HybridBackend` all methods confirmed (store, get, getByKey, query, querySemantic, etc.)
- Task 2: `embeddingModelState` at module scope line 1160 — confirmed accessible
- Task 2: `loadEmbeddingModel()` lines 1165-1254, `generateEmbedding()` lines 1259-1287 — confirmed
- Task 2: `EmbeddingGenerator = (content: string) => Promise<Float32Array>` at types.d.ts:455 — confirmed
- Task 2: `Buffer.from(entry.embedding.buffer)` at agentdb-backend.js:505 — confirmed
- Task 2: `databasePath` (SQLiteBackend), `dbPath` (AgentDB), `vectorDimension: 1536` default — all confirmed
- Task 4: Stub code at lines 805-817 — confirmed exactly
- Task 4: AutoMemoryBridge constructor, importFromAutoMemory, syncToAutoMemory — all confirmed
- Task 4: `HybridBackend.shutdown()` at line 84, `bulkInsert()` at line 285 — confirmed
- Task 4: `getSQLiteBackend()`/`getAgentDBBackend()` public at lines 508-513 — confirmed
- Task 5: `execSync` imported at doctor.js line 10 — confirmed
- Task 6: Clear insertion point at check-patches.sh line 165 — confirmed

---

## Swarm Review 4 Findings (2026-02-21)

Fourth review focused on fresh analysis with code cross-checking. Three Opus agents:
Tasks 1-3 code validation, Tasks 4-6 code validation, edge cases and risks.

### CRITICAL (3) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| R4-2 | **`const` backend cannot be reassigned** — `const { backend = 'hybrid', ... } = options` at line 898. Plan's config override code did `backend = process.env...` — illegal JS, throws `TypeError`. | Introduced `let backendChoice = backend` as a NEW variable. All config override logic and branching uses `backendChoice`. Original `backend` untouched. |
| R4-#39a | **AgentDB `ALLOWED_PRAGMAS` whitelist** — `agentdb/dist/src/security/input-validation.js` lines 50-61 does NOT include `busy_timeout`. Calling `.pragma('busy_timeout = 5000')` on AgentDB connection throws `ValidationError` (silently caught by try/catch). busy_timeout NOT set on AgentDB. | Removed AgentDB pragma attempts from Task 2 and Task 4 code. Set busy_timeout on SQLiteBackend only (guaranteed). Documented AgentDB gap as acceptable risk for v1 (separate .db file, hook lifetime ~500ms, concurrent writes rare). |
| R4-#39b | **Template literal escaping** — Task 4 code injected into `generateAutoMemoryHook()`'s template literal. `${result.imported}` etc. would be evaluated at generation time, not runtime. Must use `\${...}` in source. | Added prominent warning to Task 4 Fix section. All code blocks annotated. In fix.py Python source: `\\$\{...\}`. |

### HIGH (6) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| R4-1 | **SG-006a is a no-op** — `options.embeddings.enabled`/`model` never read by `executeInit()`. Embeddings initialized via local vars + `execSync` at lines 611-616. | Dropped SG-006a entirely. Task 1 reduced from 3 to 2 patch ops (SG-006b + SG-006c). |
| R4-3 | **`searchEntries` keyword fallback regression** — Current monolith at lines 1672-1678 falls back to SQL LIKE when semantic finds nothing. `querySemantic` is pure vector only. | Added keyword fallback to `searchEntries` adapter: if `querySemantic` returns 0 results, fall back to `hybridBackend.query({type: 'structured'})` with LIKE filter on content. |
| R4-#40 | **namespace `'all'` not translated** — Current monolith treats `'all'` as cross-namespace wildcard. `HybridBackend` treats it as literal namespace name. | ALL adapters translate `namespace === 'all'` → `undefined` before calling HybridBackend methods. |
| R4-#41 | **Upsert ID semantics** — Current monolith generates new ID on upsert. With HybridBackend, `getByKey()` + `update()` preserves old ID. | Noted and accepted. Preserving existing ID is actually better behavior (stable references). Documented in adapter mapping table. |
| R4-#43 | **MCP server no shutdown handler** — `hybridBackend` holds open SQLite connections. Process exit without `shutdown()` may leave WAL files. | Added shutdown handler section to Task 2: `process.on('beforeExit/SIGTERM/SIGINT')` calls `hybridBackend.shutdown()`. |
| R4-7/R4-#42 | **`loadEmbeddingModel()` failure → null crash** — Catch block at line 1246 can leave `embeddingModelState.dimensions` as null. `embeddingModelState.dimensions` without null guard crashes. | Added null guard: `(embeddingModelState && embeddingModelState.dimensions) || 384`. The `generateEmbedding` wrapper always succeeds (hash fallback). |

### MEDIUM (5) — Fixed in plan

| # | Issue | Resolution |
|---|-------|-----------|
| R4-4 | **`crypto.randomUUID()` not available on Node 18 LTS** — Not imported in memory-initializer.js. | Use existing ID pattern from line 1549: `` `entry_${Date.now()}_${Math.random().toString(36).substring(7)}` ``. Or use `createDefaultEntry()` which calls `generateMemoryId()` internally. |
| R4-5 | **Config.yaml regex breaks on blank lines** — `((?:[ \t]+.*\n)*)` stops at blank lines between `memory:` and `backend:`. | Updated regex to `((?:[ \t]*.*\n)*?(?=^\S|\Z))` which handles blank lines within sections. |
| R4-6 | **`initializeIntelligence()` must set flag when gating** — If neural disabled but `intelligenceInitialized` stays `false`, callers re-invoke in a loop. | Added explicit requirement to Task 3: `intelligenceInitialized = true` MUST be set in the early-return gating path. Code example added. |
| R4-#44 | **Use `createDefaultEntry()` from `@claude-flow/memory`** — Exported from root (types.js:20-40). Handles all MemoryEntry defaults via `generateMemoryId()`. Avoids manual NOT NULL field construction. | `storeEntry` adapter now uses `createDefaultEntry()` + field overrides instead of manual object construction. Import added alongside HybridBackend. |
| R4-#47 | **`listEntries` offset ignored** — `backend.query()` without `type` field auto-routes to AgentDB, which ignores `offset`. | `listEntries` adapter now passes `type: 'structured'` to force SQLite routing where `offset` works correctly. |

### LOW (2) — Noted

| # | Issue | Notes |
|---|-------|-------|
| R4-#44b | **AgentDB `bulkInsert` is NOT transactional** — crash during `importFromAutoMemory()` = partial data. | Acceptable for v1. Auto-memory import is idempotent (re-run on next session). |
| R4-#48 | **Hook doesn't call `bridge.destroy()`** — Periodic sync timer not stopped. | Harmless — `backend.shutdown()` is called, and hook exits immediately after. Timer would be GC'd anyway. |

### Confirmed OK

- Task 1: `enableEmbeddings`/`embeddingModel` ARE used at lines 611-616 via execSync. Only `options.embeddings` is dead.
- Task 2: `createDefaultEntry()` exported from `@claude-flow/memory` root (index.js line 45).
- Task 4: `bulkInsert()` without `embeddingGenerator` doesn't crash — stores entries without embeddings.
- Task 4: `PROJECT_ROOT` derived from `import.meta.url` — robust, not cwd-dependent.
- Task 5: `doctor.js` extension point is clean — follows `{name, status, message, fix?}` pattern.
- Python triple-quote escaping: safe for JS template literals, backticks, and `${}`.

### Updated patch feasibility ratings (after R4 fixes)

| Task | Rating | Notes |
|------|--------|-------|
| SG-006 | **EASY** | Reduced to 2 ops (SG-006a dropped). Clean insertion points. |
| WM-001 | **HARD** | Now 5 ops (a–e) + shutdown handler. `backendChoice` variable rename. Adapter complexity increased (keyword fallback, namespace translation, createDefaultEntry, structured routing). Largest patch in project (~250-300 lines). |
| WM-002 | **EASY** | 1 op. Must set `intelligenceInitialized = true` in gating path. |
| WM-003 | **MODERATE** | Template string escaping is the main challenge. `\${...}` in fix.py Python source. AgentDB pragma removed (simpler). |
| CF-003 | **EASY** | Clean extension point in doctor.js. |
| Syntax | **EASY** | Must use `$dist_src` inside existing loop (not `$BASE`). |
