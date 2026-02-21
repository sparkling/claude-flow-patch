# Memory Architecture Analysis

Status date: 2026-02-21

This document describes the three memory/intelligence systems in
`@claude-flow/cli` v3.1.0-alpha.41, how they relate to each other, and where
the genuine gaps are.  For ruvector-specific analysis, see
`docs/ruvector-integration-analysis.md`.

---

## 1) The Three Systems

Initial analysis framed these as "siloed memory systems" that need unification.
Deeper investigation reveals they are **three distinct systems serving different
purposes** — a database, an ML model, and a policy engine.

### System 1 — MCP Memory (Knowledge Store)

**Purpose**: General-purpose fact storage and retrieval for the agent.

| Attribute | Value |
|-----------|-------|
| **Storage** | `~/.swarm/memory.db` (sql.js WASM SQLite, WAL mode) |
| **Vector index** | `~/.swarm/hnsw.index` + `hnsw.metadata.json` (HNSW via `@ruvector/core VectorDb`) |
| **Schema** | 9 tables — `memory_entries`, `patterns`, `pattern_history`, `trajectories`, `trajectory_steps`, `migration_state`, `sessions`, `vector_indexes`, `metadata` (v3.0.0) |
| **Embedding model** | `@xenova/transformers` ONNX (default 768-dim, configurable; 384-dim after EM-001 patch) |
| **Write paths** | MCP tool `memory_store`, CLI `memory store`, 5 post-event handlers in hooks-tools.js (postEdit, postCommand, postTask, trajectoryEnd, patternStore) |
| **Read paths** | MCP tools `memory_retrieve`/`memory_search`/`memory_list`/`memory_stats`, CLI `memory search`/`retrieve`/`list`, MCP tool `hooks_intelligence_pattern-search` |
| **Key files** | `memory/memory-initializer.js` (1,983 lines), `mcp-tools/memory-tools.js` (490 lines), `commands/memory.js` (1,278 lines) |

**Analogy**: A database.  Claude stores and retrieves facts, solutions, and
context through explicit MCP tool calls.

### System 2 — SONA / Neural (Learning Engine)

**Purpose**: Learn from agent trajectories to optimize future routing and
pattern recognition.

| Attribute | Value |
|-----------|-------|
| **Storage** | `~/.claude-flow/neural/patterns.json` (ReasoningBank), `~/.claude-flow/neural/stats.json`, `.swarm/sona-patterns.json` (routing patterns), `.swarm/ewc-fisher.json` (Fisher matrix) |
| **Learning algorithm** | SONA: circular buffer signal recording (<0.05 ms), EWC++ consolidation, MicroLoRA adaptation, temporal decay, LRU eviction at 5,000 patterns |
| **Write paths** | `recordStep()` -> SONA circular buffer + ReasoningBank, `recordTrajectory()`, SONA optimizer `processTrajectoryOutcome()` |
| **Read paths** | `neural patterns` CLI, `neural predict` CLI, `findSimilarPatterns()`, MCP tools `neural_patterns`/`neural_predict`/`neural_status` |
| **Key files** | `memory/intelligence.js` (765 lines), `memory/sona-optimizer.js`, `memory/ewc-consolidation.js`, `commands/neural.js`, `mcp-tools/neural-tools.js` |

**Analogy**: An ML model.  It learns from experience (trajectory outcomes) and
improves routing over time.  Not a general-purpose store.

### System 3 — Guidance (Policy Enforcement Engine)

**Purpose**: Compile `CLAUDE.md` into enforceable policy, gate unsafe actions,
prove decisions cryptographically, evolve rules based on what works.

| Attribute | Value |
|-----------|-------|
| **Storage** | `.claude-flow/data/ranked-context.json` (PageRank), `.claude-flow/data/auto-memory-store.json`, `.claude-flow/data/graph-state.json`, `.claude-flow/guidance/` (proof chain, trust, conformance) |
| **Core function** | Compile CLAUDE.md -> Constitution + Shards -> enforce gates -> record proof -> evolve rules |
| **Write paths** | `init()` bootstraps from MEMORY.md, `consolidate()` recomputes PageRank, `recordEdit()` appends to pending-insights.jsonl, guidance autopilot promotes local rules |
| **Read paths** | `getContext(prompt)` scores entries via Jaccard trigrams + PageRank (top-5), guidance gates evaluate commands/content/tools |
| **Key files** | `.claude/helpers/hook-handler.cjs` (233 lines), `.claude/helpers/intelligence.cjs` (750+ lines), `@claude-flow/guidance` package (compiler, retriever, gates, ledger) |

**Analogy**: A policy engine.  It does not store general facts — it enforces
team rules from `CLAUDE.md`, prevents unsafe operations, and evolves governance
based on outcomes.  The routing/context output is a side effect of knowing
which rules apply to the current task, not a general memory recall.

From the `@claude-flow/guidance` README:

> "This is not a prompt engineering library.  It is not a wrapper around
> CLAUDE.md.  It is a runtime governance system with enforcement gates,
> cryptographic proofs, and feedback loops."

---

## 2) These Are Not "Siloed Memory"

| Misconception | Reality |
|--------------|---------|
| "Three memory systems" | A database (1), an ML model (2), and a policy engine (3) |
| "Knowledge in one is invisible to the others" | Claude can already query System 1 via MCP tools at any time |
| "Hook routing needs access to all stored knowledge" | Hook routing needs policy context (CLAUDE.md rules), not general facts |
| "2/3 of stored knowledge is unreachable" | Each system's knowledge serves its own purpose; cross-querying would conflate concerns |

---

## 3) The Dead-End Write Problem

Five MCP hook handlers write to System 1 (MCP memory) after events, but
**nothing reads the data back**:

| Handler | Line | Writes to namespace | What it stores |
|---------|------|-------------------|----------------|
| `hooksPostEdit` | hooks-tools.js:519 | `edits` | File path, success/failure, agent, timestamp |
| `hooksPostCommand` | hooks-tools.js:592 | `commands` | Command, exit code, success/failure |
| `hooksPostTask` | hooks-tools.js:950 | `tasks` | Task ID, success/failure, agent, quality |
| `hooksTrajectoryEnd` | hooks-tools.js:1661 | `trajectories` | Full trajectory with steps, verdict, feedback |
| `hooksPatternStore` | hooks-tools.js:1790 | `patterns` | Pattern content, type, confidence, metadata |

All five write with `generateEmbeddingFlag: true` — vectors are generated,
HNSW entries are created — but 4 of 5 namespaces (`edits`, `commands`, `tasks`,
`trajectories`) are **never read by anything**.  The fifth (`patterns`) is only
read if the user manually calls `hooksPatternSearch`.

`hooksRoute` (hooks-tools.js:614) never reads from any of these namespaces.
It has a lazy-loaded `searchEntries()` import (hooks-tools.js:8-20) that exists
but is never called during routing.

This means: the system accumulates routing-relevant data (which agents
succeeded at which tasks, trajectory outcomes, learned patterns) but the
routing decision doesn't use any of it.

**Contrast with ruvector standalone**: ruvector's `hooks_route` reads from
Q-learning patterns that `hooks_trajectory_end` writes.  The loop is closed.
See `docs/ruvector-integration-analysis.md` section 4.

---

## 4) Local Memory vs MCP Memory Disconnect

Two separate stores exist for "memory" and they never communicate:

### Local memory (auto-memory-hook.mjs)

- Backend: `JsonFileBackend` wrapping `.claude-flow/data/auto-memory-store.json`
- Source: MEMORY.md entries, session insights, intelligence.cjs PageRank outputs
- Read by: `hook-handler.cjs` -> `intelligence.cjs` -> `getContext(prompt)`
- Module: CJS (cold-start <1ms)

### MCP memory (.swarm/memory.db)

- Backend: sql.js WASM SQLite + HNSW index
- Source: MCP tool `memory_store`, CLI `memory store`, 5 post-event handlers
- Read by: MCP tools `memory_search`/`memory_retrieve`, CLI `memory search`
- Module: ESM (cold-start ~400ms for WASM load)

### What this means

- Knowledge stored via MCP tools (`memory_store`) is invisible to the
  intelligence.cjs PageRank system that runs on every hook event
- Knowledge in MEMORY.md / local store is invisible to MCP `memory_search`
- `auto-memory-hook.mjs` does NOT connect to `.swarm/memory.db` — it uses
  its own JSON file
- There is no sync step between the two stores

### Why both exist

The local store exists because of the **cold-start constraint**.  Claude Code
hooks must respond in <10ms.  `hook-handler.cjs` is CJS (synchronous require,
~1ms startup).  Loading sql.js WASM takes ~400ms — too slow for the hook path.

So the local store (JSON file, CJS-compatible, instant load) serves the hook
path, while MCP memory (SQLite, ESM, slow to initialize) serves explicit agent
queries.  The separation is a performance decision, not an architectural one.

---

## 5) Embedding Incompatibility

There are **four incompatible embedding families** across the system:

| Function | Location | Type | Dimensions | Compatible with |
|----------|----------|------|-----------|-----------------|
| `generateSimpleEmbedding()` | hooks-tools.js:88 | Hash (deterministic) | 384 | Only itself |
| `generateHashEmbedding()` | ruvector/vector-db.js:144 | Hash (deterministic) | 768 (default) | Only itself |
| `generateEmbedding()` | memory-initializer.js:1259 | ONNX transformer | 384 (or 768) | ruvector `embedAsync()` |
| SONA patterns | intelligence.js | Hash | 384 | Only itself |
| ruvector `embed()` | intelligence-engine.js:183 | Hash fallback (sync) | 64 or 256 | Only itself |
| ruvector `embedAsync()` | intelligence-engine.js:211 | ONNX MiniLM-L6-v2 | 384 | memory-initializer ONNX |
| ruvector attention | (when `@ruvector/attention` available) | Multi-head attention | 256 | Only itself |

Only ONNX embeddings (memory-initializer.js and ruvector's `embedAsync()`)
produce real semantic similarity.  The monolith never reaches ONNX for
routing — it always falls back to hash.

Cross-searching between families produces meaningless similarity scores.  Any
bridge between systems must use **text-based search** (keywords, trigrams,
BM25), not vector search.

---

## 6) System Comparison

| Dimension | System 1 (MCP Memory) | System 2 (SONA/Neural) | System 3 (Guidance) | RuVector (standalone) |
|-----------|----------------------|----------------------|-------------------|--------------------|
| **Purpose** | Fact storage + retrieval | Learning from trajectories | CLAUDE.md enforcement | Full intelligence stack |
| **Analogy** | Database | ML model | Policy engine | Integrated brain |
| **When it runs** | On explicit MCP tool call | During neural train / trajectory recording | On every hook event | On ruvector MCP tool call |
| **Who triggers it** | Agent (via MCP tools) | Agent (via neural commands) or auto (post-task) | Claude Code hooks (automatic) | Agent (via ruvector MCP tools) |
| **What it stores** | Key/value entries + embeddings | Trajectory patterns + routing confidence | CLAUDE.md shards + PageRank + proof chain | Memories, Q-values, trajectories, co-edits, errors |
| **What it outputs** | Query results (entries, scores) | Predictions, pattern matches | Gate decisions (allow/block), context suggestions | Routing decisions, memory recall, error suggestions |
| **Module system** | ESM | ESM | CJS entry + ESM lazy-load | ESM (MCP server) |
| **Startup cost** | ~400 ms (WASM SQLite) | ~5 ms (JSON parse) | ~1 ms (CJS require) | ~50 ms (JSON parse + VectorDB init) |
| **Storage** | `.swarm/memory.db` | `.claude-flow/neural/patterns.json` | `.claude-flow/data/*.json` | `.ruvector/intelligence.json` |
| **Write-read loops** | Closed (search/retrieve work) | Closed (neural predict works) | Closed (getContext works) | All closed |
| **Integration with monolith** | Direct (MCP tools) | Direct (neural commands) | Direct (hooks) | Minimal (embedded copies used instead) |

---

## 7) Four Separate Data Stores

| Store | Owner | Location | Read by |
|-------|-------|----------|---------|
| `.swarm/memory.db` | @claude-flow/cli (MCP memory) | Per-project | MCP `memory_search/retrieve` only |
| `.ruvector/intelligence.json` | ruvector (standalone) | Per-project or `~/` | ruvector MCP tools only |
| `.claude-flow/neural/patterns.json` | SONA/neural | Per-project | `neural patterns/predict` only |
| `.claude-flow/data/*.json` | Guidance | Per-project | `hook-handler.cjs` only |

Each store is invisible to the others.  Knowledge accumulated in one
cannot be queried by another.

---

## 8) Init Wizard Memory Backend Options — All Cosmetic

The `init --wizard` command presents 4 memory backend choices.  All 4 produce
**identical runtime behavior**.  The wizard writes the selection to config files
but the memory initialization code never reads it back.

### The 4 options

| Option | Wizard description | What the user expects |
|--------|-------------------|----------------------|
| **Hybrid** | SQLite + AgentDB (recommended) | Both engines, best of both |
| **AgentDB** | 150x faster vector search | AgentDB's native HNSW |
| **SQLite** | Standard SQL storage | Standard SQLite |
| **In-Memory** | Fast but non-persistent | No disk persistence |

### What actually happens

**Step 1: Selection stored** (`init.js:531-540`)

The wizard saves the choice to `options.runtime.memoryBackend` as `'hybrid'`,
`'agentdb'`, `'sqlite'`, or `'memory'`.

**Step 2: Config files written** (`executor.js:1097`, `settings-generator.js:84-90`)

Both `.claude-flow/config.yaml` and `.claude/settings.json` receive the value:
```yaml
memory:
  backend: hybrid    # or agentdb, sqlite, memory
  enableHNSW: true
```

**Step 3: Config never read** (`memory-initializer.js:897-1069`)

`initializeMemoryDatabase()` accepts a `backend` parameter but **never branches
on it**.  The function always executes the same code path:

```javascript
// backend parameter is destructured but never used in any conditional
const { backend = 'hybrid', ... } = options;

// Always does this — no if/switch on backend:
const initSqlJs = (await import('sql.js')).default;
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run(MEMORY_SCHEMA_V3);

return {
    backend,  // echoes back the input string, nothing more
    features: {
        vectorEmbeddings: true,   // hardcoded true (line 998)
        patternLearning: true,    // hardcoded true (line 999)
        temporalDecay: true,      // hardcoded true (line 1000)
        hnswIndexing: true,       // hardcoded true (line 1001) — ignores enableHNSW!
        migrationTracking: true   // hardcoded true (line 1004)
    }
};
```

**Step 4: MCP tools hardcode backend string** (`memory-tools.js`)

Every MCP memory tool returns a hardcoded backend identifier:

| Tool | Hardcoded response |
|------|--------------------|
| `memory_store` (line 172) | `'sql.js + HNSW'` |
| `memory_search` (line 299) | `'HNSW + sql.js'` |
| `memory_retrieve` (line 227) | `'sql.js + HNSW'` |
| `memory_delete` (line 339) | `'sql.js + HNSW'` |
| `memory_list` (line 391) | `'sql.js + HNSW'` |

### AgentDB: installed, never imported

`agentdb` v2.0.0-alpha.3.7 is a real package in `node_modules/` with graph DB,
Cypher queries, GNN learning, and reflexion memory.  But `grep` across
`dist/src/` finds **zero imports** of it.  The "150x faster vector search"
option resolves to `sql.js + HNSW` — the same backend every other option uses.

### What all 4 options actually run

```
.swarm/memory.db (sql.js WASM SQLite)
  ├── 18 tables, 13 indexes (MEMORY_SCHEMA_V3)
  ├── HNSW search attempted first
  ├── Brute-force cosine fallback if HNSW fails
  └── Embeddings: ONNX MiniLM-L6-v2 (384-dim) or hash fallback
```

### Promise vs reality

| Option | Promise | Reality |
|--------|---------|---------|
| **Hybrid** | SQLite + AgentDB | sql.js only.  AgentDB never loaded. |
| **AgentDB** | 150x faster vector search | sql.js + HNSW.  AgentDB never imported. |
| **SQLite** | Standard SQL storage | sql.js (WASM SQLite).  Honest-ish. |
| **In-Memory** | Fast, non-persistent | sql.js with persistence to `.swarm/memory.db`. |

The config infrastructure exists (wizard → YAML/JSON → parameter passing).
The backend-switching logic was never implemented.  This is a **stub** —
the parameter flows through the system and emerges in status messages,
but never affects behavior.

---

## 9) Identified Gaps (7 total)

### Gap 1: Dead-end MCP writes (hooks-tools.js)

Five post-event handlers write to MCP memory with embedding generation, but
`hooksRoute` never reads them back.  Wasted compute and storage.

Options:
- **(a)** Wire `hooksRoute` to read from these namespaces (text-based search)
- **(b)** Remove `generateEmbeddingFlag: true` from dead-end writes
- **(c)** Add a consolidation step that feeds stored data into the router

### Gap 2: Hardcoded routing patterns

The semantic router in `getSemanticRouter()` uses 12 static `TASK_PATTERNS`
that never update from learned data.  Routing confidence is always ~50% with
"Default routing - no specific pattern matched."

Options:
- **(a)** Incorporate learned patterns from MCP memory at init time
- **(b)** Make `TASK_PATTERNS` enrichable via configuration

### Gap 3: Local and MCP memory disconnected

`auto-memory-hook.mjs` uses `JsonFileBackend` (local JSON), not
`.swarm/memory.db` (SQLite).  The two stores never sync.

Options:
- **(a)** Have `auto-memory-hook.mjs` use the real MCP backend
- **(b)** Add a sync step at session boundaries

### Gap 4: Hash embeddings override ruvector ONNX

`dist/src/ruvector/vector-db.js:144` always calls `generateHashEmbedding()`
even when ruvector loads successfully.  Downgrades all vectors from semantic
to bag-of-chars.

Options:
- **(a)** Wire `vector-db.js` to call ruvector's `embedAsync()` when available
- **(b)** Use ruvector's attention embeddings (256-dim, sync) as intermediate

### Gap 5: Embedded ruvector reimplementations

14 files in `dist/src/ruvector/` duplicate ruvector in pure JS.
`hooks-tools.js` imports these instead of the installed package.

Options:
- **(a)** Replace embedded copies with imports from the actual ruvector package
- **(b)** Document as transitional, track removal via GitHub issue

### Gap 6: MCP tool name collision

Both ruvector and @claude-flow/cli expose `hooks_route`, `hooks_stats`,
`hooks_trajectory_*`, `hooks_force_learn`.  When both MCP servers are
registered, Claude may call either version non-deterministically.

Options:
- **(a)** Rename claude-flow's tools to a distinct prefix
- **(b)** Delegate claude-flow's handlers to ruvector when available

---

### Gap 7: Init wizard backend options are stubs

The wizard presents 4 memory backends but `initializeMemoryDatabase()` ignores
the selection.  All 4 run identical sql.js + HNSW code.  AgentDB is installed
but never imported.

Options:
- **(a)** Implement actual backend switching in `initializeMemoryDatabase()`
- **(b)** Remove the wizard options and document the single backend honestly
- **(c)** Replace with ruvector's working backend chain (native → RVF → memory)

---

## 10) Source References

### hooks-tools.js (MCP hook handlers)

| Line | What it does |
|------|-------------|
| 8-20 | Lazy-load of `searchEntries` (exists but unused by routing) |
| 88-123 | `generateSimpleEmbedding` (hash-based, incompatible with ONNX) |
| 184-211 | Try `@ruvector/router` native VectorDb, catch -> fallback |
| 221 | Import `../ruvector/semantic-router.js` as fallback |
| 519 | `hooksPostEdit` — writes to `edits` namespace (dead-end) |
| 592 | `hooksPostCommand` — writes to `commands` namespace (dead-end) |
| 614-735 | `hooksRoute` handler (routing hot path, never reads MCP memory) |
| 950 | `hooksPostTask` — writes to `tasks` namespace (dead-end) |
| 1661 | `hooksTrajectoryEnd` — writes to `trajectories` namespace (dead-end) |
| 1790 | `hooksPatternStore` — writes to `patterns` namespace |
| 1845 | `hooksPatternSearch` — only handler that reads stored patterns |

### Other key files

| File | What it does |
|------|-------------|
| `memory/memory-initializer.js` (1,983 lines) | MCP memory backend: SQLite + HNSW init |
| `mcp-tools/memory-tools.js` (490 lines) | MCP memory tool definitions |
| `memory/intelligence.js` (765 lines) | SONA/neural learning engine |
| `memory/sona-optimizer.js` | EWC++ consolidation, LoRA adaptation |
| `.claude/helpers/hook-handler.cjs` (233 lines) | Guidance dispatcher |
| `.claude/helpers/intelligence.cjs` (750+ lines) | PageRank + Jaccard scoring |
| `auto-memory-hook.mjs` | Local memory (JsonFileBackend, not SQLite) |
| `dist/src/ruvector/vector-db.js:144` | Hash embedding override |
| `dist/src/ruvector/semantic-router.js` | Pure JS router, 12 hardcoded patterns |

### Init wizard (backend selection that goes nowhere)

| File | What it does |
|------|-------------|
| `commands/init.js:531-540` | Wizard presents 4 backend choices, stores to `options.runtime.memoryBackend` |
| `init/settings-generator.js:84-90` | Writes backend to `.claude/settings.json` |
| `init/executor.js:1097` | Writes backend to `.claude-flow/config.yaml` |
| `memory/memory-initializer.js:897-1069` | Accepts `backend` param, **never branches on it** |
| `memory/memory-initializer.js:998-1004` | Hardcodes all features to `true` regardless of backend |
| `mcp-tools/memory-tools.js:172,227,299,339,391` | Hardcodes `'sql.js + HNSW'` in every tool response |
| `node_modules/agentdb/` | v2.0.0-alpha.3.7 installed, zero imports in dist/src/ |
