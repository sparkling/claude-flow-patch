# RuVector Integration Analysis

Status date: 2026-02-21

This document describes how the `ruvector` package works internally, and how
`@claude-flow/cli` integrates (or fails to integrate) with it.

---

## 1) What RuVector Is

RuVector (`ruvector@0.1.99`) is a self-contained intelligence system with its
own vector database, memory, learning engine, CLI, and MCP server.  It is a
separate npm package from `@claude-flow/cli`.

### Package structure

```
ruvector/
  bin/cli.js              (304 KB — bundled CLI, 150+ commands)
  bin/mcp-server.js       (102 KB — MCP server, 60+ tools)
  dist/core/
    intelligence-engine.js (38 KB — full learning stack)
    neural-embeddings.js   (42 KB — hippocampal dynamics)
    adaptive-embedder.js   (32 KB — micro-LoRA fine-tuning)
    learning-engine.js     (22 KB — 9 RL algorithms)
    sona-wrapper.js        (8.4 KB — SONA continual learning)
    agentdb-fast.js        (8.9 KB — fast episode storage)
    onnx-embedder.js       (15 KB — ONNX MiniLM-L6-v2)
    onnx/pkg/
      ruvector_onnx_embeddings_wasm_bg.wasm (7.1 MB — embedded ONNX model)
  dist/index.js            (VectorDB wrapper + 3-tier fallback)
```

### Storage

All data lives in `.ruvector/intelligence.json` (per-project or
`~/.ruvector/intelligence.json` global).  This is entirely separate from
`@claude-flow/cli`'s `.swarm/memory.db`.

---

## 2) How Vectors Work in RuVector

### Embedding generation (3-tier fallback)

| Priority | Method | Dimensions | Quality | When used |
|----------|--------|-----------|---------|-----------|
| 1 | **ONNX** (`@xenova/transformers` MiniLM-L6-v2) | 384 | Best (semantic) | Async only (`embedAsync()`) |
| 2 | **Attention** (`@ruvector/attention` Flash/MultiHead) | 256 | Good | When ONNX unavailable, sync context |
| 3 | **Hash** (positional hash with L2 normalization) | 64 or 256 | Poor (bag-of-chars) | Always available, sync default |

Critical detail in `intelligence-engine.js:183-191`: the sync `embed()` method
**always falls back to hash** even when ONNX is initialized, because ONNX is
async-only.  Only `embedAsync()` actually uses the ONNX model.

### VectorDB (3-tier backend)

| Priority | Backend | Source | Performance |
|----------|---------|--------|-------------|
| 1 | **Native** (`@ruvector/core`) | Rust NAPI bindings | 10M+ inserts/sec, 100K+ queries/sec |
| 2 | **RVF** (`@ruvector/rvf`) | Persistent binary `.rvf` files | Good, COW branching |
| 3 | **Stub** (in-memory mock) | Built-in fallback | insert/search stubs only |

Detection at startup (`dist/index.js`):
```
try @ruvector/core → implementationType = 'native'
catch → try @ruvector/rvf → implementationType = 'rvf'
catch → StubVectorDb → implementationType = 'wasm'
```

The `VectorDBWrapper` class auto-converts metadata objects to/from JSON strings
and ensures vectors are `Float32Array`.

### HNSW parameters

- `m`: 16-32 edges per node
- `efConstruction`: 200-400
- `efSearch`: 200-400
- Search: 0.01-1ms per query (native), vs brute-force ~2.5ms

---

## 3) How Memory Works in RuVector

### Dual storage in mcp-server.js

The `Intelligence` class (`mcp-server.js:81-330`) maintains two parallel stores:

1. **Legacy** — `this.data` loaded from/saved to `.ruvector/intelligence.json`
2. **Engine** — `IntelligenceEngine` instance with in-memory Maps + VectorDB

When `remember(content, type)` is called:
- Engine stores in its `memories` Map + inserts into VectorDB (HNSW)
- Legacy appends to `this.data.memories[]` array
- Both paths run — data is duplicated

When `recall(query, topK)` is called:
- Engine tries VectorDB HNSW search (150x faster)
- Falls back to brute-force cosine similarity over `this.data.memories[]`

### Data schema

```json
{
  "patterns": { "state|action": { "q_value": 0.75, "visits": 12 } },
  "memories": [
    {
      "content": "text",
      "type": "project|code|decision|context",
      "embedding": [0.1, ...],
      "created": "2026-02-21T..."
    }
  ],
  "trajectories": [...],
  "errors": { "error_msg": ["fix1", "fix2"] },
  "agents": {},
  "edges": [],
  "activeTrajectories": {}
}
```

---

## 4) How Learning Works in RuVector

### Q-Learning routing

`intelligence-engine.js:577-600`:
- State = `"edit:.ts"`, `"fix:.rs"`, etc.
- Action = agent name (`"rust-developer"`, `"coder"`)
- Update rule: `Q ← Q + α(reward - Q)`, where α = 0.1
- Stored in `routingPatterns` Map

### SONA trajectories

`intelligence-engine.js:516-561`:
- `beginTrajectory(context)` → records embedding + context via `@ruvector/sona`
- `addTrajectoryStep(activations, reward)` → attention weights per step
- `endTrajectory(quality)` → triggers Micro-LoRA + EWC++ learning
- SONA provides: Micro-LoRA (rank 2, fast), Base-LoRA (rank 8, slow),
  EWC++ (catastrophic forgetting prevention), pattern clustering

### Agent routing

`intelligence-engine.js:417-492`:
1. Build state from task + file extension
2. Embed task text (hash or ONNX)
3. Apply SONA micro-LoRA transformation if available
4. Find similar patterns via ReasoningBank
5. Check learned Q-values (`routingPatterns` Map)
6. Check custom `agentMappings`
7. Boost confidence if SONA patterns match
8. Return best agent + confidence + alternates

### Other learning systems

| System | Location | What it learns |
|--------|----------|---------------|
| **Co-edit patterns** | `recordCoEdit(file1, file2)` | Files frequently edited together |
| **Error patterns** | `recordErrorFix(error, fix)` | Error → fix mappings with fuzzy match |
| **Worker triggers** | `registerWorkerTrigger()` | Task keyword → agent mappings |
| **FastAgentDB** | `agentdb-fast.js` | Episode storage with state embeddings |

### Closed write-read loops

Unlike `@claude-flow/cli`'s dead-end writes (see `docs/memory-architecture-analysis.md`), **ruvector's data
flows are complete**:

| Write path | Read path | Loop closed? |
|-----------|-----------|-------------|
| `hooks_remember` → VectorDB insert | `hooks_recall` → VectorDB search | **Yes** |
| `hooks_trajectory_end` → Q-learning update | `hooks_route` → Q-value lookup | **Yes** |
| `hooks_error_record` → errorPatterns Map | `hooks_error_suggest` → fuzzy similarity | **Yes** |
| `hooks_coedit_record` → coEditPatterns Map | `hooks_coedit_suggest` → frequency lookup | **Yes** |
| SONA trajectory → pattern clustering | `route()` → `sona.findPatterns()` | **Yes** |

---

## 5) RuVector MCP Server

`bin/mcp-server.js` exposes 60+ tools across several categories:

### Core intelligence (11 tools)

| Tool | What it does |
|------|-------------|
| `hooks_stats` | Statistics (patterns, memories, trajectories) |
| `hooks_route` | Route task to best agent (Q-learning + SONA) |
| `hooks_remember` | Store in vector memory |
| `hooks_recall` | Semantic search of memory |
| `hooks_init` | Initialize in project |
| `hooks_pretrain` | Analyze repository + git history |
| `hooks_build_agents` | Generate agent configs |
| `hooks_verify` | Verify hook configuration |
| `hooks_doctor` | Diagnose issues |
| `hooks_export` / `hooks_import` | Data backup/restore |

### Pattern learning (6 tools)

`hooks_swarm_recommend`, `hooks_suggest_context`,
`hooks_trajectory_begin/step/end`, `hooks_coedit_record`

### Error/co-edit learning (4 tools)

`hooks_coedit_suggest`, `hooks_error_record`, `hooks_error_suggest`,
`hooks_force_learn`

### Code analysis (10 tools)

`hooks_ast_analyze`, `hooks_ast_complexity`, `hooks_diff_analyze`,
`hooks_diff_classify`, `hooks_diff_similar`, `hooks_coverage_route`,
`hooks_coverage_suggest`, `hooks_graph_mincut`, `hooks_graph_cluster`,
`hooks_security_scan`

### Advanced (10 tools)

`hooks_rag_context`, `hooks_git_churn`, `hooks_route_enhanced`,
`hooks_attention_info`, `hooks_gnn_info`, `hooks_learning_config`,
`hooks_learning_stats`, `hooks_learning_update`, `hooks_learn`,
`hooks_algorithms_list`

### Compression (4 tools)

`hooks_compress`, `hooks_compress_stats`, `hooks_compress_store`,
`hooks_compress_get`

### RVF vector store (9 tools)

`rvf_create`, `rvf_open`, `rvf_ingest`, `rvf_query`, `rvf_delete`,
`rvf_status`, `rvf_compact`, `rvf_derive`, `rvf_segments`

### Query engines (3 tools)

`rvlite_sql`, `rvlite_cypher`, `rvlite_sparql`

### Background workers (8 tools)

`workers_dispatch`, `workers_status`, `workers_results`, `workers_triggers`,
`workers_stats`, `workers_presets`, `workers_phases`, `workers_create/run`

---

## 6) How @claude-flow/cli Integrates with RuVector

### Package dependency model

In `@claude-flow/cli`'s `package.json`, @ruvector packages are declared as
**`optionalDependencies`** — npm installs them when possible but the CLI
degrades gracefully if they're missing:

```json
"optionalDependencies": {
  "@ruvector/attention": "^0.1.4",
  "@ruvector/learning-wasm": "^0.1.29",
  "@ruvector/router": "^0.1.27",
  "@ruvector/sona": "^0.1.5"
}
```

The CLI also exports its embedded ruvector modules as public entry points:

```json
"exports": {
  "./ruvector": "./dist/src/ruvector/index.js",
  "./ruvector/*": "./dist/src/ruvector/*.js"
}
```

### 17 installed @ruvector packages

The npx cache contains a full @ruvector ecosystem:

| Package | Version | Purpose |
|---------|---------|---------|
| `@ruvector/core` | 0.1.30 | Rust NAPI vector database (HNSW, 50k+ inserts/sec) |
| `@ruvector/router` | 0.1.28 | Semantic router with native HNSW |
| `@ruvector/attention` | 0.1.4 | Flash/MultiHead attention (native bindings) |
| `@ruvector/sona` | 0.1.5 | SONA learning (LoRA, EWC++, ReasoningBank) |
| `@ruvector/learning-wasm` | 0.1.29 | WASM MicroLoRA (<100us latency) |
| `@ruvector/gnn` | — | Graph neural network |
| `@ruvector/rvf` | — | Persistent binary `.rvf` vector store |
| `@ruvector/ruvllm` | — | LLM integration |
| `@ruvector/rvf-solver` | — | RVF solver |
| `@ruvector/rvf-wasm` | — | WASM-based RVF ops |
| + platform bindings | — | `*-linux-x64-gnu`, `*-linux-x64-musl` NAPI modules |

All 17 are installed.  Most are unused by the monolith at runtime.

### The dependency chain

```
@claude-flow/cli (monolith, v3.1.0-alpha.44)
│
├── optionalDependencies:
│   ├── @ruvector/attention ^0.1.4
│   ├── @ruvector/learning-wasm ^0.1.29
│   ├── @ruvector/router ^0.1.27
│   └── @ruvector/sona ^0.1.5
│
├── dist/src/ruvector/              ← 14 EMBEDDED JS files (copies/reimplementations)
│   ├── vector-db.js                ← Wraps import('ruvector'), fallback to FallbackVectorDB
│   ├── semantic-router.js          ← Pure JS cosine router (NOT ruvector native)
│   ├── q-learning-router.js        ← Q-learning reimplemented
│   ├── flash-attention.js          ← Flash attention reimplemented
│   ├── lora-adapter.js             ← LoRA reimplemented
│   ├── moe-router.js               ← Mixture of Experts reimplemented
│   ├── model-router.js             ← Model routing reimplemented
│   ├── enhanced-model-router.js    ← Enhanced model routing
│   ├── coverage-router.js          ← Coverage-aware routing
│   ├── coverage-tools.js           ← Coverage MCP tool wrappers
│   ├── diff-classifier.js          ← Diff analysis
│   ├── graph-analyzer.js           ← Graph boundary analysis
│   ├── ast-analyzer.js             ← AST code analysis
│   └── index.js                    ← Re-exports all above
│
├── dist/src/mcp-tools/hooks-tools.js  ← Tries @ruvector/router, falls back to above
├── dist/src/memory/memory-initializer.js  ← Uses @ruvector/core for HNSW
├── dist/src/services/ruvector-training.js ← Only file that properly uses real packages
│
├── (V3 modular packages — installed but NOT used by monolith)
│   ├── @claude-flow/neural         ← depends on @ruvector/sona (real integration)
│   ├── @claude-flow/memory         ← mentions ruvector in HNSW fallback chain
│   └── @claude-flow/hooks          ← no direct ruvector dependency
│
└── ruvector (npm package)          ← Installed in node_modules, barely used
```

### All dynamic imports of @ruvector packages

| Import | Files that use it | What for |
|--------|-------------------|----------|
| `import('@ruvector/core')` | memory-initializer.js, ruvector/index.js, ruvector/q-learning-router.js | VectorDB backend |
| `require('@ruvector/router')` | hooks-tools.js:191 | Native HNSW routing (frequently fails) |
| `import('@ruvector/attention')` | neural.js, ruvector-training.js, hooks-tools.js | Flash attention |
| `import('@ruvector/learning-wasm')` | neural.js, ruvector-training.js | WASM neural training |
| `import('@ruvector/sona')` | ruvector-training.js | SONA learning |
| `import('@ruvector/ast')` | ruvector/ast-analyzer.js | AST analysis (optional) |
| `import('@ruvector/coverage')` | ruvector/coverage-router.js | Coverage analysis (optional) |
| `import('@ruvector/diff')` | ruvector/diff-classifier.js | Diff classification (optional) |
| `import('ruvector')` | ruvector/vector-db.js:110 | VectorDB class lookup |

All wrapped in try/catch with graceful fallbacks.

### Four levels of ruvector integration

#### Level 1: Embedded reimplementations (dist/src/ruvector/)

The monolithic CLI contains 14 files that **reimplement** ruvector functionality
in pure JavaScript.  These are NOT imports of the ruvector package.

Key files:

**`vector-db.js`** — tries `import('ruvector')` for VectorDB class, but:
- Falls back to `FallbackVectorDB` (in-memory brute-force) on any failure
- Even when ruvector loads successfully, `generateEmbedding()` **always uses
  hash embeddings** — it never calls ruvector's ONNX embedder:

```javascript
// vector-db.js:144-147
generateEmbedding: (text, dimensions = 768) => {
    // ruvector may not have this - use fallback
    return generateHashEmbedding(text, dimensions);
},
```

**`semantic-router.js`** — pure JS cosine similarity router.  The file header
explicitly states: *"This is a fallback implementation since @ruvector/router's
native VectorDb has bugs."*  It is a standalone 177-line JS class, not an import.

**Other files** (`q-learning-router.js`, `flash-attention.js`, `lora-adapter.js`,
`moe-router.js`, `model-router.js`, etc.) — all self-contained JS
implementations that do not import from the ruvector package.

#### Level 2: Optional native VectorDb (hooks-tools.js)

The routing hot path in `hooks-tools.js:184-237` tries to use `@ruvector/router`
native HNSW for routing:

```javascript
// hooks-tools.js:191-211
const router = require('@ruvector/router');
if (router.VectorDb && router.DistanceMetric) {
    const db = new router.VectorDb({
        dimensions: 384,
        distanceMetric: router.DistanceMetric.Cosine,
    });
    nativeVectorDb = db;
    return { router: null, backend: routerBackend, native: nativeVectorDb };
}
```

This frequently fails due to:
- Lock errors in concurrent MCP environments
- Missing native bindings on some platforms
- Database file contention

On failure, it falls through to the pure JS `SemanticRouter`, which is populated
from 12 hardcoded `TASK_PATTERNS` and never updates from learned data.

#### Level 3: Real package imports (ruvector-training.js, memory-initializer.js)

Two files in the monolith actually import the real @ruvector packages properly:

**`services/ruvector-training.js`** — WASM-accelerated neural training:

```javascript
const wasmPath = require.resolve('@ruvector/learning-wasm/ruvector_learning_wasm_bg.wasm');
const learningWasm = await import('@ruvector/learning-wasm');
const attention = await import('@ruvector/attention');
const sona = await import('@ruvector/sona');
```

This is the **only code path** that uses ruvector's real SONA, attention, and
WASM capabilities.  It's only triggered by explicit `neural train` commands,
not during normal routing or memory operations.

**`memory/memory-initializer.js`** — HNSW vector index:

```javascript
const ruvectorModule = await import('@ruvector/core').catch(() => null);
const { VectorDb } = ruvectorModule;
// Uses Cosine distance, dimensions from config
```

Uses `@ruvector/core` for the HNSW index backing `.swarm/hnsw.index`.  This is
the one place where native ruvector performance matters for MCP memory search.
Falls back to sql.js if unavailable.

#### Level 4: V3 modular packages (not used by monolith)

The new V3 packages have real ruvector integration:

**`@claude-flow/neural`** (depends on `@ruvector/sona: latest`):
- `sona-integration.js` wraps `SonaEngine.withConfig()` for trajectory learning
- `SONALearningEngine` class provides learn/adapt/findPatterns
- Supports 5 modes: real-time, balanced, research, edge, batch
- Performance targets: <0.05ms learn, <0.1ms adapt

**`@claude-flow/memory`** (AgentDB backend):
- `agentdb-backend.js` mentions ruvector in fallback chain:
  *"Automatic fallback: native hnswlib → ruvector → WASM"*
- Uses `agentdb@2.0.0-alpha.3.7` as primary backend, not ruvector directly

**But the monolithic CLI does not import these packages.**  It imports from its
own `../ruvector/` directory (the embedded copies), not from `@claude-flow/neural`
or `@claude-flow/memory`.

---

## 7) What Actually Happens at Runtime

### Routing path

1. `hooks-tools.js` `getSemanticRouter()` is called
2. Tries `require('@ruvector/router')` for native HNSW — usually fails
3. Falls back to `import('../ruvector/semantic-router.js')` — pure JS
4. Populates router from 12 hardcoded `TASK_PATTERNS`
5. Generates hash embedding for query (NOT ONNX)
6. Returns cosine similarity match — confidence always ~50%

The router backend is tracked and reported:

```javascript
// hooks-tools.js:242-250
function getRouterBackendInfo() {
    switch (routerBackend) {
        case 'native':  return { backend: 'native VectorDb (HNSW)', speed: '16k+ routes/s' };
        case 'pure-js': return { backend: 'pure JS (cosine)', speed: '47k+ routes/s' };
        default:        return { backend: 'none', speed: 'N/A' };
    }
}
```

In practice, `routerBackend` is almost always `'pure-js'`.

### Memory path (MCP tools)

1. `hooks-tools.js` post-event handlers write to `.swarm/memory.db`
2. Embeddings generated via `generateSimpleEmbedding()` (hash-based)
3. Data stored in SQLite with HNSW index
4. **Nothing reads this data back** (dead-end writes — see ADR-001)

### ruvector MCP server (if running separately)

1. Completely independent process
2. Stores in `.ruvector/intelligence.json`
3. Uses its own IntelligenceEngine with VectorDB
4. Its own `hooks_route` tool (name collision with claude-flow's)
5. Has closed write-read loops (actually learns)

---

## 8) Comparison: ruvector Standalone vs @claude-flow/cli Integration

| Capability | ruvector standalone | @claude-flow/cli integration |
|-----------|-------------------|---------------------------|
| **VectorDB** | Native Rust HNSW via @ruvector/core | FallbackVectorDB (brute-force) |
| **Embeddings** | ONNX MiniLM-L6-v2 (384-dim, semantic) | Hash-based (384-dim, bag-of-chars) |
| **Learning** | Q-learning + SONA + EWC++ | None (12 hardcoded patterns) |
| **Memory store** | `.ruvector/intelligence.json` | `.swarm/memory.db` (dead-end writes) |
| **Routing** | Learned from trajectories | Hardcoded TASK_PATTERNS |
| **MCP tools** | 60+ (all functional) | 30+ (5 post-event are dead-end) |
| **Write-read loops** | All closed | 4/5 namespaces never read |
| **Co-edit patterns** | Learned and recalled | Not present |
| **Error patterns** | Learned with fuzzy match | Not present |
| **Data flows through** | VectorDB → Q-learning → routing | Write → HNSW → nothing |

---

## 9) Name Collision: Overlapping MCP Tools

Both ruvector and @claude-flow/cli expose MCP tools with the `hooks_` prefix.
If both MCP servers are registered, the following tools collide:

| Tool name | ruvector behavior | @claude-flow/cli behavior |
|-----------|------------------|--------------------------|
| `hooks_route` | Q-learning + SONA routing | 12 hardcoded patterns |
| `hooks_stats` | Engine stats from intelligence.json | Stub stats (patched by IN-001) |
| `hooks_force_learn` | Triggers SONA learning cycle | Calls `intel.tick()` (broken pre-RV-001) |
| `hooks_trajectory_begin/step/end` | Records to IntelligenceEngine | Writes to MCP memory (dead-end) |
| `hooks_pattern_store/search` | Stores/searches in engine | Writes to MCP memory / manual search |

When Claude receives both tool sets, it may call either version depending on
which MCP server responds first.  The ruvector version is generally more
functional.

---

## 10) V3 Modular Packages: The Intended Architecture

The V3 packages (`@claude-flow/neural`, `@claude-flow/memory`,
`@claude-flow/hooks`) represent the intended future architecture:

```
@claude-flow/hooks
  └── @claude-flow/neural
  │     └── @ruvector/sona          ← Real SONA integration
  └── @claude-flow/memory
        └── agentdb                 ← AgentDB with HNSW
        └── sql.js                  ← SQLite WASM
```

In this architecture:
- `@claude-flow/neural` wraps `@ruvector/sona` properly via `SONALearningEngine`
- `@claude-flow/memory` uses AgentDB (which can fall back to ruvector for HNSW)
- `@claude-flow/hooks` orchestrates both

**But the current monolithic CLI does not use these packages.**  The V3 packages
are installed in the npm tree because they share the `@claude-flow` scope, but
`hooks-tools.js` imports from `../ruvector/` (its own embedded copies).

---

## 11) Key Findings

1. **17 @ruvector packages installed, mostly unused.**  All are
   `optionalDependencies` — installed in the npx cache but the monolith's
   runtime code paths rarely reach them.

2. **The ruvector integration is mostly cosmetic.**  The monolith has 14
   reimplemented files in `dist/src/ruvector/` that duplicate ruvector's API
   surface but use hash embeddings and brute-force search instead of ONNX and
   native HNSW.

3. **Hash embeddings everywhere.**  Even when ruvector loads successfully,
   `vector-db.js:144` explicitly uses `generateHashEmbedding()` instead of
   calling ruvector's ONNX embedder.  Semantic quality is never achieved.

4. **Native VectorDb is attempted but usually fails.**  `hooks-tools.js:191`
   tries `@ruvector/router` native HNSW, but lock errors and missing bindings
   cause frequent fallback to the pure JS router.

5. **The pure JS SemanticRouter is hardcoded.**  It uses 12 static
   `TASK_PATTERNS` that never update from learned data.  This is why routing
   confidence is always ~50%.

6. **Two files actually use real @ruvector packages.**
   `ruvector-training.js` imports `@ruvector/sona`, `@ruvector/attention`,
   and `@ruvector/learning-wasm` for neural training.
   `memory-initializer.js` imports `@ruvector/core` for HNSW indexing.
   These are the only real integration points.

7. **V3 packages have real integration but aren't wired.**
   `@claude-flow/neural` properly wraps `@ruvector/sona` with
   `SONALearningEngine`, but the monolith doesn't import it.

8. **ruvector standalone works correctly.**  When run as its own MCP server, it
   has closed write-read loops, real ONNX embeddings, Q-learning routing, SONA
   trajectories, co-edit patterns, and error learning.

9. **Two separate intelligence stores.**  `.ruvector/intelligence.json` and
   `.swarm/memory.db` never communicate.  Knowledge in one is invisible to the
   other.

---

## 12) Source References

### ruvector package

| File | Lines | What it does |
|------|-------|-------------|
| `bin/mcp-server.js:81-330` | Intelligence class | Dual legacy + engine storage |
| `bin/mcp-server.js:1250-1700` | Tool handlers | MCP tool implementations |
| `dist/core/intelligence-engine.js:72-900` | IntelligenceEngine | Full learning stack |
| `dist/core/intelligence-engine.js:183-207` | `embed()` | 3-tier embedding fallback |
| `dist/core/intelligence-engine.js:336-398` | `remember()/recall()` | Vector memory ops |
| `dist/core/intelligence-engine.js:417-492` | `route()` | Q-learning + SONA routing |
| `dist/core/intelligence-engine.js:516-561` | Trajectory methods | SONA trajectory recording |
| `dist/core/intelligence-engine.js:577-627` | Episode learning | Q-value updates + batch |
| `dist/core/intelligence-engine.js:697-763` | Error/co-edit | Pattern learning |
| `dist/index.js:38-94` | VectorDB detection | 3-tier backend fallback |
| `dist/index.js:132-222` | VectorDBWrapper | Auto JSON metadata conversion |

### @claude-flow/cli embedded ruvector

| File | What it does |
|------|-------------|
| `dist/src/ruvector/index.js` | Re-exports 14 embedded modules |
| `dist/src/ruvector/vector-db.js` | VectorDB wrapper with hash-only embeddings |
| `dist/src/ruvector/semantic-router.js` | Pure JS cosine router (fallback) |
| `dist/src/ruvector/q-learning-router.js` | Q-learning reimplementation |
| `dist/src/ruvector/flash-attention.js` | Flash attention reimplementation |
| `dist/src/ruvector/lora-adapter.js` | LoRA reimplementation |
| `dist/src/ruvector/moe-router.js` | Mixture of Experts reimplementation |

### @claude-flow/cli hooks-tools.js integration points

| Line | What it does |
|------|-------------|
| `71` | Lazy import of `../ruvector/moe-router.js` |
| `83-84` | `nativeVectorDb` state variable |
| `184-211` | Try `@ruvector/router` native, catch → fallback |
| `221` | Import `../ruvector/semantic-router.js` as fallback |
| `242-250` | `getRouterBackendInfo()` — reports which backend is active |
| `257` | Import `../ruvector/flash-attention.js` |
| `271` | Import `../ruvector/lora-adapter.js` |
| `630-648` | Routing hot path — try native, fallback to SemanticRouter |
| `773` | Read `.ruvector/intelligence.json` for stats display |
| `874` | Import `../ruvector/enhanced-model-router.js` |

### @claude-flow/cli real @ruvector imports

| File | Imports | What for |
|------|---------|----------|
| `services/ruvector-training.js` | `@ruvector/learning-wasm`, `@ruvector/attention`, `@ruvector/sona` | WASM neural training (only on `neural train`) |
| `memory/memory-initializer.js` | `@ruvector/core` | HNSW vector index for `.swarm/hnsw.index` |
| `commands/neural.js` | `@ruvector/attention`, `@ruvector/learning-wasm` | Neural command handlers |
| `ruvector/index.js` | `@ruvector/core` | Version/availability check |
| `ruvector/ast-analyzer.js` | `@ruvector/ast` | AST analysis (optional, catches failure) |
| `ruvector/coverage-router.js` | `@ruvector/coverage` | Coverage analysis (optional, catches failure) |
| `ruvector/diff-classifier.js` | `@ruvector/diff` | Diff classification (optional, catches failure) |

### V3 modular packages

| File | What it does |
|------|-------------|
| `@claude-flow/neural/dist/sona-integration.js` | Wraps `@ruvector/sona` SonaEngine |
| `@claude-flow/neural/dist/sona-manager.js` | 5-mode SONA manager |
| `@claude-flow/neural/dist/index.js` | Exports SONALearningEngine + 7 RL algorithms |
| `@claude-flow/neural/package.json` | Depends on `@ruvector/sona: latest` |
| `@claude-flow/memory/dist/agentdb-backend.js` | AgentDB with ruvector fallback chain |
