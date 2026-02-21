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
are incompatible — no direct data migration between them.

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

**Patch ops**:

1. **SG-006a**: After embeddings prompts (~line 584), before `executeInit()` call,
   assign results:
   ```javascript
   options.embeddings.enabled = enableEmbeddings;
   options.embeddings.model = embeddingModel;
   ```

2. **SG-006b**: After hooks multiSelect (~line 500), add:
   ```javascript
   options.hooks.permissionRequest = hooks.includes('permissionRequest');
   ```

3. **SG-006c**: At line 678, replace hardcoded `--topology hierarchical` with
   template using `options.runtime.topology || 'hierarchical-mesh'`.

### Upstream alignment

- Matches #1181 (SG-004) intent — wizard should have full parity with init
- Matches #993 — init should deploy all configured features
- No ADR conflict

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `commands/init.js` | `INIT_CMD` | 3 patch ops |

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
MCP tool → memory-tools.js:60 → getMemoryFunctions() → memory-initializer.js → sql.js
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
getEntry({id, key, namespace})
deleteEntry({id})
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

Adapter mapping (thin — each is 3-8 lines):

| Old function | HybridBackend method | Notes |
|-------------|---------------------|-------|
| `storeEntry({key, value, namespace, tags, ttl})` | `backend.store({id: uuid(), namespace, key, value, metadata: {tags}, ttl, createdAt: Date.now()})` | Build a `MemoryEntry` object. For upsert: `getByKey()` first, then `update()` or `store()` |
| `searchEntries({query, namespace, limit, threshold})` | `backend.querySemantic({text: query, namespace, limit, threshold})` | Semantic search routes to AgentDB automatically |
| `listEntries({namespace, limit, offset})` | `backend.query({namespace, limit, offset})` | Structured query routes to SQLite automatically |
| `getEntry({id, key, namespace})` | `id ? backend.get(id) : backend.getByKey(namespace, key)` | Direct lookup |
| `deleteEntry({id})` | `backend.delete(id)` | Direct passthrough |

`HybridBackendConfig`:
```typescript
{
  sqlite?: Partial<SQLiteBackendConfig>;  // passed to SQLiteBackend (better-sqlite3)
  agentdb?: Partial<AgentDBBackendConfig>; // passed to AgentDBBackend (wraps agentdb pkg)
  defaultNamespace?: string;     // default: 'default'
  embeddingGenerator?: fn;       // optional embedding function
  routingStrategy?: string;      // 'auto' | 'sqlite-first' | 'agentdb-first'
  dualWrite?: boolean;           // default: true — writes to BOTH backends
  semanticThreshold?: number;    // default: 0.7
  hybridMaxResults?: number;     // default: 100
}
```

**Internal wiring:**
- `HybridBackend` creates `SQLiteBackend` (static import of `better-sqlite3`) +
  `AgentDBBackend` (dynamic import of `agentdb` package with fallback)
- `dualWrite: true` (default) → `store()/update()/delete()` write to BOTH via `Promise.all()`
- Query routing: exact/prefix/tag → SQLite, semantic → AgentDB, hybrid → both merged

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

```javascript
// 1. Read env var (available when MCP server started via .mcp.json)
let backend = process.env.CLAUDE_FLOW_MEMORY_BACKEND;

// 2. Fall back to config.yaml if no env var
if (!backend) {
  try {
    const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const match = content.match(/^\s*backend:\s*(\S+)/m);
      if (match) backend = match[1].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// 3. Normalize (reuse config-adapter pattern)
backend = ['hybrid','sqlite','agentdb','memory'].includes(backend)
  ? backend : 'hybrid';
```

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
   - Build `HybridBackendConfig` based on backend choice:
     - `'hybrid'` (default) → `{ sqlite: { path: dbPath }, agentdb: { dimensions, indexType: enableHNSW ? 'hnsw' : 'flat' }, dualWrite: true }`
     - `'agentdb'` → `{ agentdb: { dimensions, indexType: 'hnsw' }, dualWrite: false }`
     - `'sqlite'` → `{ sqlite: { path: dbPath }, dualWrite: false, routingStrategy: 'sqlite-first' }`
     - `'memory'` → `{ dualWrite: false }` (in-memory defaults)
   - `const backend = new HybridBackend(config)`
   - `await backend.initialize()`
   - On import/init failure + `runtime.strict: true` (default) →
     **ERROR** with fix command + `--use-fallbacks` suggestion. Stop.
   - On import/init failure + `runtime.strict: false` (`--use-fallbacks`) →
     **WARN** with degraded state + fix command. Fall through to sql.js monolith.
   - If config says `backend: sqljs` → use SqlJsBackend directly (explicit choice, not fallback)
   - If config says `backend: memory` → use in-memory Map (explicit choice, data lost on exit)

2. **WM-001b**: Create adapter functions that wrap `HybridBackend` to match the
   existing `storeEntry/searchEntries/listEntries/getEntry/deleteEntry` signatures.
   See API compatibility table above for the exact mapping. Each adapter is 3-8
   lines. The key mapping decisions:
   - `storeEntry` builds a `MemoryEntry` object (`{id: crypto.randomUUID(), namespace, key, value, metadata: {tags}, createdAt: Date.now()}`). For upsert: `getByKey()` first.
   - `searchEntries` calls `backend.querySemantic()` which auto-routes to AgentDB.
   - `listEntries` calls `backend.query()` which auto-routes to SQLite.
   - `getEntry` calls `backend.get(id)` or `backend.getByKey(namespace, key)`.
   - `deleteEntry` calls `backend.delete(id)` directly.

3. **WM-001c**: Build `HybridBackendConfig` from config sources:
   ```javascript
   // Use SEPARATE db path to avoid schema conflict with existing .swarm/memory.db
   const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
   const hybridConfig = {
     sqlite: { path: hybridDbPath },                          // .swarm/hybrid-memory.db (NEW)
     agentdb: {
       dimensions: dimensions,                                // from embeddings.json
       indexType: enableHNSW ? 'hnsw' : 'flat',              // from config.yaml
     },
     dualWrite: backend === 'hybrid',                         // only dual-write in hybrid mode
     defaultNamespace: 'default',
     semanticThreshold: 0.7,
   };
   ```
   Note: separate DB file avoids corrupting existing `.swarm/memory.db` (different schema).

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
| `import('@claude-flow/memory')` throws | better-sqlite3 static import crashes | ERROR: `@claude-flow/memory not loadable — better-sqlite3 native bindings missing. Run: npx @claude-flow/cli doctor --fix` |
| `HybridBackend.initialize()` throws | AgentDBBackend can't import agentdb | ERROR: `AgentDB backend unavailable. Run: npx @claude-flow/cli doctor --fix` |
| better-sqlite3 not compiled (Node 24) | SQLiteBackend can't create Database | ERROR: `better-sqlite3 needs rebuild for Node ${version}. Run: npx @claude-flow/cli doctor --fix` |
| Config says `backend: hybrid` but deps missing | Mismatch | ERROR: `Config requires hybrid backend but dependencies unavailable. Either fix deps or change backend to 'sqljs'.` |
| Config says `backend: sqljs` | No native deps needed | Works — user explicitly chose this, no degradation |

**No `try/catch → fall through to sql.js monolith`.** If the configured backend
can't load, the operation fails with a clear error. The ONLY exception: `doctor`
and `init` always work (they diagnose, they don't need the memory backend).

**Schema coexistence**: Because HybridBackend uses a different schema than
memory-initializer.js, we use a SEPARATE database file (`.swarm/hybrid-memory.db`)
to avoid corrupting existing data. Existing `.swarm/memory.db` is preserved.

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

**Strict mode (default) vs `--use-fallbacks`:**

`init` writes `runtime.strict` to config.yaml. Default is `true`.

| Mode | How to get | On backend failure |
|------|-----------|-------------------|
| Strict (default) | `init` / `init --wizard` | ERROR with fix command + suggestion to re-init with `--use-fallbacks` |
| Fallbacks | `init --use-fallbacks` | WARN with degraded state + fix command. Fallback proceeds. |

Even in fallback mode, degradation is ALWAYS visible:
- Every fallback logs a `[WARN]` line with reason, actual backend, and fix command
- `memory status` shows: `Backend: sql.js (fallback)`, `Configured: hybrid`, `Fix: doctor --fix`
- `doctor` reports: intended vs actual backend mismatch

**Error handling rules:**
1. Feature-level failure, not tool-level — `memory store` errors, but `doctor`/`init` always work
2. Error message includes exact fix command: `Run: npx @claude-flow/cli doctor --fix`
3. Error message includes escape hatch: `Or re-init with: npx @claude-flow/cli init --use-fallbacks`
4. `memory status` ALWAYS shows which backend is actually active + configured vs actual
5. `doctor` checks intended vs actual backend, warns on mismatch
6. `init` wizard pre-checks available backends, only offers what works on the system
7. Strict mode: one path, works or errors. Fallback mode: warn + degrade, never silent.

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
- Config `backend: hybrid` + missing deps + strict → clear ERROR with fix + `--use-fallbacks` hint
- Config `backend: hybrid` + missing deps + `--use-fallbacks` → WARN + sql.js fallback (visible)
- Config `backend: sqljs` → works without native deps (explicit choice)
- `memory status` shows actual backend name
- `bash check-patches.sh` passes
- `npm test` passes

---

## Task 3: Respect Wizard Config at Runtime (new defect WM-002)

### Note: This also unblocks ADR-048 (AutoMemoryBridge)

ADR-048 specifies bidirectional sync between Claude Code auto-memory
(`~/.claude/projects/<project>/memory/`) and AgentDB + HNSW. Phase 1 exists in
`@claude-flow/memory` (883 lines of `auto-memory-bridge.ts`, 58 tests) with core
API: `recordInsight()`, `syncToAutoMemory()`, `importFromAutoMemory()`,
`curateIndex()`. But Phases 2-4 (hooks integration, CLI/MCP commands, swarm
integration) remain incomplete because the CLI never imports `@claude-flow/memory`.

Once Task 2 wires in `@claude-flow/memory` and Task 3 makes config values
consumable, Task 4 (WM-003) activates AutoMemoryBridge by replacing the stubs
in `auto-memory-hook.mjs` with real calls to `importFromAutoMemory()` and
`syncToAutoMemory()`. The hooks are already wired in settings.json
(SessionStart/SessionEnd). GitHub issue: #1102.

### Problem

5 config.yaml values written by the wizard are never read at runtime:

| Config Key | Written at | Consumer |
|------------|-----------|----------|
| `memory.backend` | executor.js:1085 | Nobody |
| `memory.enableHNSW` | executor.js | Nobody |
| `neural.enabled` | executor.js | Nobody |
| `memory.learningBridge.enabled` | executor.js | Nobody |
| `memory.memoryGraph.enabled` | executor.js | Nobody |

### Fix

**Depends on Task 2** — once @claude-flow/memory is wired in:

1. **WM-002a**: `memory.backend` → consumed by WM-001a (backend branching in
   initializeMemoryDatabase). **Already handled by Task 2.**

2. **WM-002b**: `memory.enableHNSW` → pass to `HybridBackendConfig.agentdb.indexType`:
   if false, set `'flat'` instead of `'hnsw'`. **Already handled by WM-001c.**

3. **WM-002c**: `neural.enabled` → gate SONA/neural initialization in
   `memory/intelligence.js`. When false, skip `initializeLocalReasoningBank()`.

4. **WM-002d**: `memory.learningBridge.enabled` → gate LearningBridge in
   @claude-flow/memory config. Pass `sonaMode` from config.

5. **WM-002e**: `memory.memoryGraph.enabled` → gate MemoryGraph instantiation
   in @claude-flow/memory config.

### Files

| File | Variable | What changes |
|------|----------|-------------|
| `memory/memory-initializer.js` | `MI` | WM-002b: HNSW gating |
| `memory/intelligence.js` | (new var) | WM-002c: neural gating |

### Upstream alignment

- Matches ADR-006 config-driven backend selection
- Matches #1142 (config should be consumed, not decorative)
- Matches #1143 (HNSW dims should come from config)

### Verification

- Set `memory.enableHNSW: false` → verify flat index used
- Set `neural.enabled: false` → verify neural patterns disabled
- Set `memory.backend: agentdb` → verify AgentDB backend used

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

**Patch ops**:

1. **WM-003a**: Replace the `doImport()` stub with actual `AutoMemoryBridge` usage:
   ```javascript
   async function doImport() {
     let memPkg;
     try { memPkg = await import('@claude-flow/memory'); } catch (e) {
       if (strict) {
         console.error('[AutoMemory] ERROR: @claude-flow/memory not loadable:', e.message);
         console.error('[AutoMemory] Run: npx @claude-flow/cli doctor --fix');
         console.error('[AutoMemory] Or re-init with: npx @claude-flow/cli init --use-fallbacks');
         process.exit(1);
       }
       console.warn('[AutoMemory] WARN: @claude-flow/memory not loadable — import skipped');
       console.warn('[AutoMemory] Fix: npx @claude-flow/cli doctor --fix');
       return;
     }
     const { HybridBackend, AutoMemoryBridge } = memPkg;
     const backend = new HybridBackend({
       sqlite: { path: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
       dualWrite: true,
     });
     await backend.initialize();
     const bridge = new AutoMemoryBridge(backend, {
       workingDir: PROJECT_ROOT,
       syncMode: 'on-session-end',
       minConfidence: 0.7,
     });
     const result = await bridge.importFromAutoMemory();
     if (result.imported > 0) {
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
       if (strict) {
         console.error('[AutoMemory] ERROR: @claude-flow/memory not loadable:', e.message);
         console.error('[AutoMemory] Run: npx @claude-flow/cli doctor --fix');
         process.exit(1);
       }
       console.warn('[AutoMemory] WARN: @claude-flow/memory not loadable — sync skipped');
       return;
     }
     const { HybridBackend, AutoMemoryBridge } = memPkg;
     const backend = new HybridBackend({
       sqlite: { path: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
       dualWrite: true,
     });
     await backend.initialize();
     const bridge = new AutoMemoryBridge(backend, {
       workingDir: PROJECT_ROOT,
       syncMode: 'on-session-end',
       minConfidence: 0.7,
     });
     const result = await bridge.syncToAutoMemory();
     if (result.synced > 0) {
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
use the same `.swarm/memory.db` path, so data written by MCP tools (Task 2)
is visible to the bridge (Task 4) and vice versa.

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
  imports entries into `.swarm/memory.db`
- On session end: `auto-memory-hook.mjs sync` writes high-confidence entries
  back to MEMORY.md + topic files
- `auto-memory-hook.mjs status` shows real file counts and sync times
- MEMORY.md stays under 200 lines after curation
- Missing `@claude-flow/memory` → clear ERROR with fix command (not silent skip)

---

## Execution Order

```
Task 1 (SG-006) ─── independent, ships first (simple fix)
Task 2 (WM-001) ─── independent of Task 1, core wiring work
Task 3 (WM-002) ─── depends on Task 2
Task 4 (WM-003) ─── depends on Tasks 2+3, activates ADR-048
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
| `lib/categories.json` | 2 | Add WM category |
| `tests/fixtures/` | all | Add fixture content for new patches |
| `tests/03-patch-apply.test.mjs` | all | Add test rows |
| `tests/04-idempotency.test.mjs` | all | Add test rows |

## GitHub Issues to Create/Comment

| Task | Action | Target |
|------|--------|--------|
| SG-006 | Create new issue | Wizard embeddings + permissionRequest capture bugs |
| WM-001 | Comment on #829 | Wire @claude-flow/memory into CLI per ADR-006/009 |
| WM-002 | Comment on #1142 | Config.yaml values consumed at runtime |
| WM-003 | Comment on #1102 | Activate AutoMemoryBridge (ADR-048 Phases 2-3) |

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

# Functional: config respect (Task 3)
# Edit config.yaml: memory.enableHNSW: false
npx @claude-flow/cli memory store --key test2 --value "world" --namespace test
# → verify no HNSW index created
```
