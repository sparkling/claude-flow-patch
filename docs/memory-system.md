# Memory System Architecture

How the patched `@claude-flow/cli` stores, searches, and learns from agent memory.

---

## Contents

- [Overview](#overview)
- [Storage Layer](#storage-layer)
  - [HybridBackend](#hybridbackend)
  - [Database Files](#database-files)
  - [Fallback Modes](#fallback-modes)
- [Session Lifecycle](#session-lifecycle)
  - [Session Start (import)](#session-start-import)
  - [During Session (MCP)](#during-session-mcp)
  - [Session End (sync)](#session-end-sync)
- [Learning Subsystems](#learning-subsystems)
  - [Intelligence.cjs (PageRank)](#intelligencecjs-pagerank)
  - [AgentDB Self-Learning (WM-009)](#agentdb-self-learning-wm-009)
  - [ReasoningBank (WM-011)](#reasoningbank-wm-011)
  - [LearningBridge (SONA)](#learningbridge-sona)
  - [MemoryGraph](#memorygraph)
- [Witness Chain (WM-010)](#witness-chain-wm-010)
- [Configuration Reference](#configuration-reference)
- [Patch Dependency Chain](#patch-dependency-chain)
- [Troubleshooting](#troubleshooting)

---

<a id="overview"></a>

## Overview

The patched memory system has three layers:

```
Claude Code Agent
       |
  Session hooks          MCP tools (memory_store / memory_search / memory_retrieve)
       |                           |
  AutoMemoryBridge          HybridBackend
  (import/sync)             (store/search/delete)
       |                       /        \
  ~/.claude/memory/     SQLite DB      AgentDB RVF
  (JSON files)          (structured)   (vector search + learning)
```

**AutoMemoryBridge** syncs Claude Code's `~/.claude/memory/*.json` files into the database at session start and back out at session end.

**HybridBackend** dual-writes every entry to both SQLite (for structured queries) and AgentDB RVF (for HNSW vector search). MCP tools talk to HybridBackend during the session.

**AgentDB v3** provides the vector search substrate. After patching (WM-008 through WM-011), it also provides self-learning feedback, witness chain tamper detection, and a ReasoningBank for storing successful reasoning patterns.

---

<a id="storage-layer"></a>

## Storage Layer

<a id="hybridbackend"></a>

### HybridBackend

Wired by [WM-001](../patch/350-WM-001-memory-wiring/). Dual-writes to two backends:

| Backend | Engine | Strength | File |
|---------|--------|----------|------|
| SQLiteBackend | better-sqlite3 (native C++) | Exact key lookups, prefix queries, tag filters | `.swarm/hybrid-memory.db` |
| AgentDBBackend | AgentDB v3 SelfLearningRvfBackend | HNSW vector search (O(log n)), self-learning | `.swarm/agentdb-memory.rvf` |

[WM-012](../patch/600-WM-012-hybrid-backend-proxies/) adds proxy methods (`recordFeedback()`, `verifyWitnessChain()`, `getWitnessChain()`) so callers interact with HybridBackend directly without reaching into the AgentDB backend.

Query routing is automatic:

| Query type | Routes to | Why |
|-----------|-----------|-----|
| Exact key | SQLite | B-tree O(log n) |
| Prefix | SQLite | LIKE with index |
| Tag filter | SQLite | JSON functions |
| Semantic search | AgentDB | HNSW O(log n) |
| Hybrid | Both | Merged results |

<a id="database-files"></a>

### Database Files

All database files live under `.swarm/` in the project root:

```
.swarm/
  hybrid-memory.db       # SQLite — structured storage, WAL mode, crash-safe
  hybrid-memory.db-wal   # SQLite write-ahead log
  agentdb-memory.rvf     # AgentDB v3 — HNSW vectors, learning state, witness chain
```

The `.rvf` (RuVector Format) file is a single-file database that contains the HNSW index, entry data, learning weights, and cryptographic witness chain in one portable file. Introduced by [WM-008](../patch/560-WM-008-agentdb-v3-upgrade/).

<a id="fallback-modes"></a>

### Fallback Modes

If native dependencies are unavailable, the system falls back gracefully:

| Condition | Behavior |
|-----------|----------|
| `better-sqlite3` + `agentdb` available | Full HybridBackend (recommended) |
| Native deps missing, `memory.backend` = `json` | JsonFileBackend at `.claude-flow/data/auto-memory-store.json` |
| Native deps missing, `memory.backend` != `json` | Error with instructions to run `doctor --install` or set backend to `json` |

Set the backend in `.claude-flow/config.json`:

```json
{
  "memory": {
    "backend": "hybrid"
  }
}
```

Valid values: `hybrid` (default), `json`, `sqlite`, `agentdb`.

---

<a id="session-lifecycle"></a>

## Session Lifecycle

The memory hook (`auto-memory-hook.mjs`) runs as a separate Node process, invoked by Claude Code's `settings.json` hooks. It has a 30-second timeout — plenty for AgentDB's ~400ms async init.

<a id="session-start-import"></a>

### Session Start (import)

```
settings.json → SessionStart hook
  → node .claude/helpers/auto-memory-hook.mjs import
    1. Read .claude-flow/config.json for backend + learning config
    2. Create HybridBackend (opens SQLite + AgentDB)
    3. Verify witness chain integrity (WM-010)
    4. Create AutoMemoryBridge
    5. bridge.importFromAutoMemory()
       → Reads ~/.claude/memory/*.json
       → Stores entries in HybridBackend (dual-write)
    6. Wire LearningBridge (SONA confidence decay/boost)
    7. Wire MemoryGraph (PageRank-aware ordering)
    8. Shutdown backend
```

<a id="during-session-mcp"></a>

### During Session (MCP)

MCP tools in `memory-tools.js` interact with HybridBackend directly:

| MCP Tool | Operation | Learning Side-Effect |
|----------|-----------|---------------------|
| `memory_store` | `backend.store(entry)` | Entry indexed in HNSW |
| `memory_search` | `backend.querySemantic(query)` | Search result IDs tracked for feedback (WM-009) |
| `memory_retrieve` | `backend.getByKey(key)` | If key was in recent search results, triggers `recordFeedback(id, 1.0)` (WM-009) |
| `memory_delete` | `backend.delete(id)` | Entry removed from HNSW index |
| `memory_list` | `backend.query({ namespace })` | -- |

<a id="session-end-sync"></a>

### Session End (sync)

```
settings.json → SessionEnd hook
  → node .claude/helpers/auto-memory-hook.mjs sync
    1. Read config, create HybridBackend
    2. Create AutoMemoryBridge
    3. bridge.syncToAutoMemory()
       → Exports entries to ~/.claude/memory/
       → Categories updated (patterns, code, project, etc.)
    4. bridge.curateIndex()
       → Updates MEMORY.md with graph-aware ordering
    5. Shutdown backend
```

---

<a id="learning-subsystems"></a>

## Learning Subsystems

Five learning mechanisms operate at different timescales:

| Subsystem | Timescale | What It Learns | Patch |
|-----------|-----------|---------------|-------|
| Intelligence.cjs | Per-session (sync) | PageRank centrality, trigram relevance, confidence decay | [IN-001](../patch/170-IN-001-intelligence-stub/) |
| AgentDB self-learning | Per-query (async) | Which search results are actually used → boosts/demotes vectors | [WM-009](../patch/570-WM-009-agentdb-learning-loop/) |
| ReasoningBank | Per-task (async) | Successful reasoning patterns → reuse across sessions | [WM-011](../patch/590-WM-011-reasoning-bank-controller/) |
| LearningBridge (SONA) | Per-access | Confidence decay/boost on individual entries | [WM-007](../patch/530-WM-007-wire-dead-config-keys/) |
| MemoryGraph | Per-session | PageRank over entry relationships | [WM-007](../patch/530-WM-007-wire-dead-config-keys/) |

<a id="intelligencecjs-pagerank"></a>

### Intelligence.cjs (PageRank)

A 916-line module (copied from `@claude-flow/cli` by [IN-001](../patch/170-IN-001-intelligence-stub/)) that implements:

- **PageRank graph**: Entries are nodes, co-access patterns are edges. High-centrality entries surface first.
- **Trigram matching**: Fast fuzzy search over entry content without embeddings.
- **Confidence decay/boost**: Entries lose confidence over time; accessing an entry boosts it.
- **Feedback loop**: `intelligence.feedback(key, outcome)` adjusts entry weights.

Lives at `.claude/helpers/intelligence.cjs`. Loaded synchronously by `require()` — must be <1ms to avoid blocking `init`.

<a id="agentdb-self-learning-wm-009"></a>

### AgentDB Self-Learning (WM-009)

[WM-009](../patch/570-WM-009-agentdb-learning-loop/) wires the feedback loop that makes vector search improve over time:

1. When `memory_search()` returns results, their IDs are tracked in a `_recentSearchHits` Map.
2. When `memory_retrieve()` fetches an entry whose ID is in `_recentSearchHits`, the system calls `recordFeedback(id, 1.0)` — positive signal.
3. AgentDB's `SelfLearningRvfBackend` uses this feedback to adjust HNSW vector positions, improving future search relevance.

The learning config is read from `config.json`:

```json
{
  "memory": {
    "agentdb": {
      "enableLearning": true,
      "learningPositiveThreshold": 0.7,
      "learningBatchSize": 32
    }
  }
}
```

<a id="reasoningbank-wm-011"></a>

### ReasoningBank (WM-011)

[WM-011](../patch/590-WM-011-reasoning-bank-controller/) instantiates AgentDB's ReasoningBank controller and wires it into the MCP hooks tools:

| MCP Tool | ReasoningBank Method | Purpose |
|----------|---------------------|---------|
| `hooks_intelligence_pattern_store` | `storeTrajectory()` + `distill()` | Store a reasoning trajectory, distill it to a reusable pattern |
| `hooks_intelligence_pattern_search` | `retrieveByContent()` | Semantic search over stored patterns with MMR diversity |

The ReasoningBank complements Intelligence.cjs:
- **Intelligence.cjs** ranks by graph centrality (which entries are most connected).
- **ReasoningBank** ranks by semantic similarity to the current task + success rate of past uses.

<a id="learningbridge-sona"></a>

### LearningBridge (SONA)

Provided by `@claude-flow/memory`. Config wired by [WM-007](../patch/530-WM-007-wire-dead-config-keys/):

| Config Key | Default | Effect |
|------------|---------|--------|
| `memory.learningBridge.enabled` | `true` | Enable/disable SONA learning |
| `memory.learningBridge.sonaMode` | `balanced` | SONA mode: `aggressive`, `balanced`, `conservative` |
| `memory.learningBridge.confidenceDecayRate` | `0.005` | Per-session decay rate |
| `memory.learningBridge.accessBoostAmount` | `0.03` | Confidence boost on access |
| `memory.learningBridge.consolidationThreshold` | `10` | Accesses before consolidation |

<a id="memorygraph"></a>

### MemoryGraph

Provided by `@claude-flow/memory`. Config wired by [WM-007](../patch/530-WM-007-wire-dead-config-keys/):

| Config Key | Default | Effect |
|------------|---------|--------|
| `memory.memoryGraph.enabled` | `true` | Enable/disable PageRank graph |
| `memory.memoryGraph.pageRankDamping` | `0.85` | PageRank damping factor |
| `memory.memoryGraph.maxNodes` | `5000` | Maximum graph nodes |
| `memory.memoryGraph.similarityThreshold` | `0.8` | Edge creation threshold |

---

<a id="witness-chain-wm-010"></a>

## Witness Chain (WM-010)

[WM-010](../patch/580-WM-010-witness-chain-verify/) adds tamper detection to the memory database.

AgentDB v3's RVF format includes a cryptographic witness chain (SHAKE-256) that records every write operation. The chain is append-only — any modification to historical entries breaks it.

**What happens at session start:**

1. `doImport()` creates and initializes HybridBackend.
2. Calls `backend.verifyWitnessChain()`.
3. If the chain is valid: normal operation.
4. If the chain is broken: logs a warning. The session continues (non-fatal) but the user is alerted to potential tampering.

**What it detects:**
- Manual edits to `.swarm/agentdb-memory.rvf`
- Partial writes from crashes
- Malicious memory injection by compromised tools

The verification is wrapped in try/catch — it never prevents a session from starting.

---

<a id="configuration-reference"></a>

## Configuration Reference

All memory settings live in `.claude-flow/config.json` under the `memory` key. Generated by `claude-flow init` (patched by [SG-008](../patch/440-SG-008-init-config-json/), [CF-009](../patch/500-CF-009-minimal-v3-defaults/)).

```json
{
  "memory": {
    "backend": "hybrid",
    "enableHNSW": true,
    "cacheSize": 100,

    "learningBridge": {
      "enabled": true,
      "sonaMode": "balanced",
      "confidenceDecayRate": 0.005,
      "accessBoostAmount": 0.03,
      "consolidationThreshold": 10
    },

    "memoryGraph": {
      "enabled": true,
      "pageRankDamping": 0.85,
      "maxNodes": 5000,
      "similarityThreshold": 0.8
    },

    "agentScopes": {
      "enabled": true,
      "defaultScope": "project"
    },

    "agentdb": {
      "vectorBackend": "rvf",
      "enableLearning": true,
      "learningPositiveThreshold": 0.7,
      "learningBatchSize": 32
    }
  },

  "neural": {
    "enabled": true,
    "modelPath": ".claude-flow/neural"
  }
}
```

| Key | Type | Default | Wired By |
|-----|------|---------|----------|
| `memory.backend` | `hybrid\|json\|sqlite\|agentdb` | `hybrid` | WM-001 |
| `memory.enableHNSW` | boolean | `true` | WM-007 |
| `memory.cacheSize` | number | `100` | WM-007 |
| `memory.learningBridge.*` | object | see above | WM-007 |
| `memory.memoryGraph.*` | object | see above | WM-007 |
| `memory.agentScopes.*` | object | see above | WM-007 |
| `memory.agentdb.vectorBackend` | `rvf\|auto` | `rvf` | WM-008 |
| `memory.agentdb.enableLearning` | boolean | `true` | WM-008, WM-009 |
| `memory.agentdb.learningPositiveThreshold` | number | `0.7` | WM-008 |
| `memory.agentdb.learningBatchSize` | number | `32` | WM-008 |
| `neural.enabled` | boolean | `true` | WM-002 |
| `neural.modelPath` | string | `.claude-flow/neural` | WM-007 |

---

<a id="patch-dependency-chain"></a>

## Patch Dependency Chain

The memory system is built by 11 patches applied in order:

```
WM-001  Wire HybridBackend into CLI
  └─ WM-003  Activate AutoMemoryBridge
       └─ WM-004  Source hook fail-loud (no silent JSON fallback)
            └─ WM-007  Wire 19 dead config.json keys
                 └─ WM-008  Upgrade AgentDB v2 → v3 (RVF, self-learning API)
                      ├─ WM-009  Wire learning feedback loop
                      ├─ WM-010  Wire witness chain verification
                      ├─ WM-011  Instantiate ReasoningBank controller
                      └─ WM-012  HybridBackend proxy methods

Supporting patches:
  IN-001   Copy full Intelligence.cjs (not stub)
  WM-002   Neural config gating (neural.enabled consumed at runtime)
  SG-008   Generate config.json (not config.yaml)
```

All patches are idempotent. Running `patch-all.sh` twice produces identical results.

---

<a id="troubleshooting"></a>

## Troubleshooting

### "Memory package not available" at session start

The `@claude-flow/memory` package is not found. Run:

```bash
npx @claude-flow/cli doctor --install
```

Or set the backend to JSON (no native deps required):

```json
{ "memory": { "backend": "json" } }
```

### "HybridBackend failed to initialize"

Native bindings for `better-sqlite3` are missing or broken. Common on Node version upgrades. Fix:

```bash
npx @claude-flow/cli doctor --install
```

This rebuilds native bindings for `better-sqlite3`, `hnswlib-node`, and `agentdb`.

### No `.swarm/` directory

The hook creates `.swarm/` automatically. If it's missing after a session, check that:

1. The session start hook ran (`node .claude/helpers/auto-memory-hook.mjs import`)
2. The project directory is writable
3. Config backend is not `json` (JSON backend writes to `.claude-flow/data/` instead)

### Witness chain warning at session start

A warning like `"witness chain verification failed"` means the `.rvf` file was modified outside normal operations. This is non-fatal — the session continues normally. Possible causes:

- Manual edits to `agentdb-memory.rvf`
- Incomplete write from a crash
- File copied from another machine

To reset, delete `.swarm/agentdb-memory.rvf` and re-import. SQLite retains all data.

### Search results not improving

Check that learning is enabled:

```json
{ "memory": { "agentdb": { "enableLearning": true } } }
```

Learning requires the agent to use `memory_retrieve` after `memory_search`. If the agent only searches but never retrieves specific results, no feedback is recorded.
