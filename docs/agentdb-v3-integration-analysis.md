# AgentDB v3 Integration Analysis

**Date**: 2026-02-25 (v2 — added R8/R9 for search routing + witness chain access)
**Scope**: WM-008 through WM-011 patches + foundation chain (WM-001, WM-003, WM-007)
**Method**: 5-agent swarm analysis — upstream source code, patch ops, patched target files, docs/ADRs, GitHub issues

---

## Executive Summary

The AgentDB v3 integration (WM-008 through WM-011) is **architecturally sound in intent but has seven critical implementation bugs** that render three of the four patches non-functional at runtime. The v2-to-v3 dependency upgrade (WM-008) succeeds at switching to RVF storage, but the self-learning, witness chain, and feedback mechanisms are dead code due to incorrect import paths, API delegation gaps, and two architectural routing issues (search path bypass and witness chain access).

| Patch | Intent | Status | Functional? |
|-------|--------|--------|-------------|
| WM-008 | Upgrade v2 to v3, RVF format | Applied | **Partial** — RVF storage works, self-learning backend never instantiated |
| WM-009 | Wire recordFeedback() learning loop | Applied | **No** — calls method on wrong object, ID type mismatch |
| WM-010 | Wire witness chain verification | Applied | **No** — calls method on wrong object |
| WM-011 | Instantiate ReasoningBank | Applied | **Yes** — works correctly via @claude-flow/neural |

**What works today**: RVF single-file storage, .rvf path migration, config schema, ReasoningBank trajectory distillation (WM-011).

**What is broken**: SelfLearningRvfBackend creation (dead import), recordFeedback() call chain (HybridBackend gap + ID mismatch), witness chain verification (HybridBackend gap + AgentDB class gap), search routing (bypasses learning backend entirely), witness chain access (targets wrong object).

---

## 1. Current State

### 1.1 What WM-008 Actually Achieved

WM-008 performs 15 patch ops + 1 shell script across 8 files in 4 packages. The following changes **work correctly**:

| Change | Works? | Evidence |
|--------|--------|---------|
| `vectorBackend: 'auto'` -> `'rvf'` in all backends | Yes | All configs point to RVF |
| `.db` paths -> `.rvf` across 8 files | Yes | File extension migration complete |
| `agentdb` dep `2.0.0-alpha.3.7` -> `3.0.0-alpha.3` | Yes | package.json updated, fix.sh upgrades binary |
| Config template includes `agentdb` subsection | Yes | executor.js generates v3 config keys |
| `save()` before `close()` in shutdown | Yes | `this.agentdb.save()` exists on AgentDB class |
| `isUnifiedMode` check in shutdown | Yes | AgentDB exposes this property |

The following changes **are dead code**:

| Change | Works? | Root Cause |
|--------|--------|-----------|
| Import `SelfLearningRvfBackend` from `agentdb` | **No** | Not exported from main entry point |
| Create learning backend via `SelfLearningRvfBackend.create()` | **No** | Variable is always `undefined` |
| Capture witness chain hash at init | **No** | `this.agentdb.getWitnessChain()` doesn't exist on AgentDB class |
| `recordFeedback()` method on AgentDBBackend | **No** | `this.learningBackend` is never set |
| `verifyWitnessChain()` method on AgentDBBackend | **No** | `this.agentdb` has no witness chain methods |

### 1.2 Bug 1: SelfLearningRvfBackend Import Path (Critical)

**Location**: `@claude-flow/memory/dist/agentdb-backend.js` (WM-008c)

WM-008c does:
```js
SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;
```

But `agentdb`'s main export (`dist/src/index.js`) does **not** re-export `SelfLearningRvfBackend`. The class is only accessible via sub-paths:
- `agentdb/dist/src/backends/rvf/SelfLearningRvfBackend.js`
- Possibly `agentdb/backends` (if the exports map includes it)

**Result**: `SelfLearningRvfBackend` is always `undefined`. The guard `if (this.config.enableLearning && SelfLearningRvfBackend)` is always false. The learning backend is never instantiated. This cascades: `this.learningBackend` is null, `recordFeedback()` returns early, `destroy()` in shutdown is a no-op.

**Verified exports from agentdb main entry**:
```
AgentDB, CausalMemoryGraph, CausalRecall, ExplainableRecall,
NightlyLearner, ReflexionMemory, SkillLibrary, LearningSystem,
ReasoningBank, EmbeddingService, EnhancedEmbeddingService,
WASMVectorSearch, HNSWIndex, AttentionService, createDatabase,
BatchOperations, QueryOptimizer, + security validators
```

`SelfLearningRvfBackend` is **not** in this list.

### 1.3 Bug 2: AgentDB Class Missing Witness Chain Methods (High)

**Location**: `@claude-flow/memory/dist/agentdb-backend.js` (WM-008d, WM-008f)

The patch calls `this.agentdb.getWitnessChain()` and `this.agentdb.verifyWitnessChain()`, but the `AgentDB` class does not have these methods. They exist on:
- `SelfLearningRvfBackend.getWitnessChain()` / `.verifyWitnessChain()`
- `RvfBackend.verifyWitness()` (note: different method name)

The `AgentDB` class exposes: `initialize()`, `close()`, `getController()`, `database` (getter), `isUnifiedMode`, `isWasm`, `vectorBackendName`, `save()`. No witness chain access.

**Result**: Witness chain capture at init (WM-008d) silently fails. The `typeof` guard prevents a crash but the hash is never stored.

### 1.4 Bug 3: HybridBackend Missing Proxy Methods (High)

**Location**: `memory-initializer.js` (WM-009a), `helpers-generator.js` (WM-010a), `auto-memory-hook.mjs` (WM-010b)

WM-009 and WM-010 call `recordFeedback()` and `verifyWitnessChain()` on `HybridBackend` instances. `HybridBackend` does NOT proxy these methods to its internal `AgentDBBackend`. It only exposes `getAgentDBBackend()` (confirmed at hybrid-backend.js:511) which returns the raw backend.

The guards (`typeof backend.verifyWitnessChain === 'function'`, `typeof _hybridBackend.recordFeedback === 'function'`) return false. Both features are silently skipped.

**The correct call chain** would be:
```js
_hybridBackend.getAgentDBBackend()?.recordFeedback(id, quality)
_hybridBackend.getAgentDBBackend()?.verifyWitnessChain()
```

### 1.5 Bug 4: recordFeedback() ID Semantic Mismatch (Medium)

**Location**: `mcp-tools/memory-tools.js` (WM-009c/d)

Even if Bug 3 were fixed, there's a deeper problem. WM-009 passes memory **entry IDs** (e.g., `entry-uuid-123`) as the `queryId` argument to `recordFeedback()`. But `SelfLearningRvfBackend.recordFeedback()` expects a **trajectory query ID** (format `q_N`, auto-assigned during `searchAsync()`).

Internally, `recordFeedback()` does:
```js
const traj = this.activeTrajectories.get(queryId);
if (!traj) return;  // Silent no-op for unknown IDs
```

Memory entry IDs will never match trajectory query IDs. The feedback is silently discarded.

**Root cause**: The learning feedback API is designed for callers who go through `SelfLearningRvfBackend.searchAsync()` (which creates trajectories), not for callers who go through `HybridBackend.querySemantic()` (which doesn't). The entire feedback path from MCP memory tools -> HybridBackend -> AgentDBBackend -> SelfLearningRvfBackend is architecturally misaligned.

### 1.6 Bug 5: WM-010b old_string Mismatch (Low)

On upstream alpha.44+ (current target), WM-003g inserts `busy_timeout` code between `await backend.initialize()` and `const bridgeConfig`. WM-010b's old_string expects only a blank line between them. After WM-003g runs (order 370), WM-010b (order 580) cannot find its match in the source hook.

**Result**: Witness chain verification is not applied to `auto-memory-hook.mjs`. It is still applied to `helpers-generator.js` (WM-010a), which covers the template path.

### 1.7 What WM-011 Does Right

WM-011 (ReasoningBank) is the **only patch in the v3 chain that works end-to-end**. It:

1. Imports `ReasoningBank` from `@claude-flow/neural` (not from `agentdb`) -- correct, this package is installed and exports the class
2. Uses a two-step init: `new RBClass(config)` + `await _reasoningBank.initialize()` -- matches the actual constructor pattern
3. Creates its own internal AgentDB instance (the neural ReasoningBank manages its own storage)
4. Exports `getReasoningBank()` getter
5. Hooks-tools.js `hooksPatternStore` uses `storeTrajectory()` + `distill()` + `memoryToPattern()` -- correct API
6. Hooks-tools.js `hooksPatternSearch` uses `retrieveByContent()` -- correct API

**Minor issues in WM-011**:
- `stateAfter: new Float32Array(768)` is all zeros (placeholder, not real state embedding) -- distillation works but with degraded quality
- `rb.storeTrajectory(trajectory)` is not awaited -- potential race with `rb.distill(trajectory)` if `storeTrajectory` is async
- Lazy loader cache in `getReasoningBankInstance()` can permanently cache `null` if called before memory init completes

### 1.8 Bug 6: Searches Bypass SelfLearningRvfBackend (Critical)

**Location**: `@claude-flow/memory/dist/agentdb-backend.js` (querySemantic path)

Even with R1 implemented (fixing the import so SelfLearningRvfBackend is instantiated), the search path **never flows through it**. The call chain is:

```
MCP memory_search -> HybridBackend.querySemantic()
  -> AgentDBBackend.querySemantic()
    -> this.agentdb.vectorBackend.search()   // <-- plain RvfBackend
```

`AgentDBBackend.querySemantic()` calls `this.agentdb.vectorBackend.search()`, which is the **plain RvfBackend** — not `SelfLearningRvfBackend.searchAsync()`. The learning backend sits beside the search path, never in it.

**Why this matters**: `SelfLearningRvfBackend.searchAsync()` is the method that:
1. Creates trajectory entries (`q_N` IDs)
2. Applies SONA enhancement to query vectors
3. Records the search context for contrastive training

Without routing searches through `searchAsync()`, no trajectories exist, `recordFeedback()` has nothing to match against, and the entire learning pipeline is inert — **even after R1-R5 are all implemented**.

**Result**: R1 through R5 are necessary but not sufficient. Without fixing the search routing, self-learning remains dead code.

### 1.9 Bug 7: Witness Chain Accessed on Wrong Object (High)

**Location**: `@claude-flow/memory/dist/agentdb-backend.js` (WM-008d, WM-008f)

R4 (original analysis) proposed accessing the witness chain via `this.learningBackend` (the SelfLearningRvfBackend). However, SelfLearningRvfBackend maintains its **own** witness chain that tracks learning-related mutations (SONA updates, contrastive training results). This is a different chain than the one that records **storage mutations** (inserts, deletes) — which is what tamper detection needs.

The correct path for tamper detection is:
```js
this.agentdb.vectorBackend?.verifyWitness?.()   // RvfBackend's chain
```

Not:
```js
this.learningBackend?.verifyWitnessChain?.()     // SelfLearningRvfBackend's chain
```

The RvfBackend's `verifyWitness()` method validates the chain of actual data mutations (SHAKE-256 hashes of inserts/removes). The learning backend's chain validates learning iterations — useful for auditing but not for tamper detection.

**Result**: Even with R1+R4 as originally specified, witness chain verification would validate the wrong chain, giving false confidence about data integrity.

### 1.10 Additional Issues

**Unbounded Map**: `_recentSearchHits` (WM-009) is never pruned except on successful retrieve. Searches without retrieves accumulate entries indefinitely.

**Silent error swallowing**: Every new code block across WM-008/009/010/011 uses `try { ... } catch {}` with empty catch bodies. Zero diagnostic output when operations fail.

**Source hook config gap**: WM-008l references `config.agentdb?.enableLearning` but `readConfig()` in the source hook does not parse the `agentdb` section from config.json. Learning is always enabled regardless of config.

---

## 2. Desired State

The optimal integration uses AgentDB v3's capabilities through their **correct API entry points**, respects the **HybridBackend delegation pattern**, and produces **measurable learning improvements**.

### 2.1 Self-Learning Search

**Goal**: Every search that produces a subsequently-used result should feed back into the learning pipeline, improving search quality by ~36% over time (per AgentDB benchmarks).

**Correct architecture**:
- `SelfLearningRvfBackend` wraps the HNSW vector backend with trajectory tracking, SONA enhancement, contrastive training, and solver optimization
- Searches go through `SelfLearningRvfBackend.searchAsync()` which creates trajectories
- Feedback is recorded via `SelfLearningRvfBackend.recordFeedback(queryId, quality)` using trajectory IDs
- The `tick()` loop runs at configurable intervals, training the model from accumulated feedback

**How it should work in practice**:
```
memory_search -> HybridBackend -> AgentDBBackend -> SelfLearningRvfBackend.searchAsync()
                                                   (returns results + trajectory ID)
memory_retrieve -> if result was from search -> recordFeedback(trajectoryId, 1.0)
periodic tick() -> SONA enhancement -> contrastive training -> solver optimization
```

### 2.2 Witness Chain Verification

**Goal**: Detect tampered or corrupted memory databases at session start.

**Correct architecture**:
- Every insert/remove through the RVF backend records a SHAKE-256 witness entry
- At session start, verify the chain is intact
- Verification uses `RvfBackend.verifyWitness()` or `SelfLearningRvfBackend.verifyWitnessChain()`
- Structural verification checks `chain.length % 73 === 0`; WASM verification provides cryptographic validation

### 2.3 ReasoningBank Pattern Learning

**Goal**: Store successful reasoning strategies and retrieve them for similar future tasks using MMR-diverse semantic search.

**Current state**: This already works via WM-011 using `@claude-flow/neural`'s ReasoningBank. The neural package's ReasoningBank is a trajectory-based 4-step pipeline (retrieve, judge, distill, consolidate) with in-memory maps + optional AgentDB storage.

There are **two different ReasoningBank classes** in the ecosystem:

| Aspect | `agentdb` ReasoningBank | `@claude-flow/neural` ReasoningBank |
|--------|------------------------|--------------------------------------|
| Constructor | `(db, embedder, vectorBackend?, learningBackend?)` | `(config?: Partial<ReasoningBankConfig>)` |
| Storage | SQLite tables (`reasoning_patterns`, `pattern_embeddings`) | In-memory Maps + optional AgentDB |
| Core Model | Pattern CRUD with SQL queries | 4-step pipeline: RETRIEVE, JUDGE, DISTILL, CONSOLIDATE |
| Key Methods | `storePattern`, `searchPatterns`, `recordOutcome` | `storeTrajectory`, `judge`, `distill`, `consolidate`, `retrieveByContent` |

WM-011 correctly uses `@claude-flow/neural`'s version. This is the better choice because it has the full distillation pipeline, and it manages its own AgentDB instance internally.

---

## 3. Gap Analysis

### 3.1 Critical Gaps (Bugs — patches applied but non-functional)

| # | Gap | Patch | Root Cause | Impact |
|---|-----|-------|-----------|--------|
| G1 | SelfLearningRvfBackend never instantiated | WM-008d | Not exported from `agentdb` main entry | All learning config is dead. No SONA, no contrastive training, no solver, no tick loop. |
| G2 | recordFeedback() calls wrong object | WM-009a | `_hybridBackend` is HybridBackend, not AgentDBBackend | Search learning feedback is never recorded |
| G3 | recordFeedback() ID mismatch | WM-009c/d | Entry IDs passed where trajectory IDs expected | Even with correct delegation, feedback is silently discarded |
| G4 | verifyWitnessChain() calls wrong object | WM-010a/b | `backend` is HybridBackend, not AgentDBBackend | Tamper detection never runs |
| G5 | getWitnessChain() calls wrong object | WM-008d | `this.agentdb` is AgentDB class, not RvfBackend | Witness chain hash never captured at init |

| G19 | Searches bypass SelfLearningRvfBackend | WM-008/009 | `querySemantic()` calls `this.agentdb.vectorBackend.search()` (plain RvfBackend), never `SelfLearningRvfBackend.searchAsync()` | No trajectories created, no SONA enhancement, entire feedback loop is inert even after G1-G5 are fixed |
| G20 | Witness chain verified on wrong object | WM-008d/f, WM-010 | R4 (original) proposed using `learningBackend` chain, which tracks learning mutations, not data mutations | Tamper detection validates wrong chain — false confidence about data integrity |

### 3.2 Design Gaps (Missing functionality)

| # | Gap | Description |
|---|-----|-------------|
| G6 | No tick() loop | SelfLearningRvfBackend's `tick()` method (which runs SONA + contrastive training + solver) is never called anywhere. Even if G1 were fixed, learning would only happen if `tick()` runs periodically. |
| G7 | No negative feedback signal | WM-009 only records positive feedback (quality=1.0 on retrieve). There is no negative signal when search results are NOT retrieved or when the agent explicitly rejects a result. The learning loop is one-sided. |
| G8 | No HybridBackend method proxies | HybridBackend doesn't expose `recordFeedback()`, `getWitnessChain()`, `verifyWitnessChain()`, or any way to get the underlying SelfLearningRvfBackend. Only `getAgentDBBackend()` (which returns the wrapper, not the SLR backend directly). |
| G9 | _recentSearchHits unbounded | Map grows monotonically. No TTL, no max-size cap, no periodic cleanup. |
| G10 | Zero-vector embeddings in WM-011c | `stateAfter: new Float32Array(768)` is all zeros, making distilled pattern embeddings meaningless for vector search. `retrieveByContent()` works around this via content-based matching, but true semantic search won't function. |
| G11 | Stale lazy-loader in WM-011b | `getReasoningBankInstance()` caches the result permanently on first call. If called before `initializeMemoryDatabase()` completes, ReasoningBank is permanently marked as unavailable. |
| G12 | No migration path from .db to .rvf | Existing users with `.swarm/agentdb-memory.db` files lose their data. No migration or conversion tool is provided. |

### 3.3 Documentation Gaps

| # | Gap | Description |
|---|-----|-------------|
| G13 | ADR-003 not updated for shared RVF | WM-011a shares `agentdb-memory.rvf` path with HybridBackend. ADR-003 (separate DB files) does not contemplate this. The neural ReasoningBank creates its own internal AgentDB handle to the same file. |
| G14 | ~~ADR-005 stale (YAML parser)~~ | **Fixed**: ADR-005 updated to reflect config.json parsing (JSON.parse). |
| G15 | ADR-006 stale (busy_timeout) | Discusses ALLOWED_PRAGMAS on AgentDB's SQLite connections. RVF format may use different concurrency model. |
| G16 | memory-backend-analysis.md stale paths | Still shows `agentdb-memory.db` instead of `.rvf`. |
| G17 | WM-009 README wrong op count | Says 3 ops, fix.py has 7 (after R3/R6 amendments). |
| G18 | ReasoningBank API documented incorrectly | memory-system-analysis.md describes `storePattern()`, `searchPatterns()` API. WM-011 actually uses `storeTrajectory()`, `distill()`, `retrieveByContent()`. |

---

## 4. Recommendations

### R1: Fix the SelfLearningRvfBackend Import (fixes G1)

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Sub-path import** | `await import('agentdb/dist/src/backends/rvf/SelfLearningRvfBackend.js')` | Direct, works with current package | Fragile — depends on internal file layout. May break on agentdb updates. Not in the package's `exports` map, so may fail with strict ESM resolution. |
| **B: Use RvfBackend directly** | Access `this.agentdb.vectorBackend` (which is an RvfBackend in unified mode), then wrap it with learning capabilities | Uses supported API surface | More complex. RvfBackend is also not exported. Need to verify vectorBackend is accessible. |
| **C: Use AgentDB's getController()** | Use the controllers that ARE exported and accessible (ReflexionMemory, SkillLibrary, etc.) instead of SelfLearningRvfBackend | Uses public API, future-proof | Different learning model — controller-based, not search-pipeline-based. Would change the architecture from "search improves itself" to "patterns learned from outcomes." |
| **D: Construct SelfLearningRvfBackend from RvfBackend** | Import ruvector's RvfBackend, create it, then wrap with SelfLearningRvfBackend | Full control of the learning pipeline | Depends on ruvector internals. SelfLearningRvfBackend has a private constructor (must use `static create()`). Possible but complex. |

**Recommendation**: Option A with a fallback. The sub-path import is the most straightforward fix. Add a `try { } catch {}` around the import to handle the case where the file layout changes. The current guard pattern (`if (SelfLearningRvfBackend)`) already provides the fallback.

**New patch op**:
```python
# Replace the import line
patch("WM-008c-fix",
    AGENTDB_BACKEND,
    """SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;""",
    """SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;
      if (!SelfLearningRvfBackend) {
        try { const slrMod = await import('agentdb/dist/src/backends/rvf/SelfLearningRvfBackend.js');
              SelfLearningRvfBackend = slrMod.SelfLearningRvfBackend || slrMod.default; } catch {}
      }""")
```

### R2: Fix the HybridBackend Delegation (fixes G2, G4, G8)

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Patch HybridBackend to proxy** | Add `recordFeedback()` and `verifyWitnessChain()` methods to HybridBackend that delegate to `this.agentdbBackend` | Clean API — callers don't need to know about internals | Requires patching another file (`hybrid-backend.js`). Adds a new path variable to common.py. |
| **B: Use getAgentDBBackend()** | Change WM-009/WM-010 to call `_hybridBackend.getAgentDBBackend()?.recordFeedback()` | Minimal change, uses existing API | Callers must know about the two-layer architecture. Slightly uglier. |
| **C: Store direct AgentDBBackend reference** | At init time, capture `_agentdbBackend = _hybridBackend.getAgentDBBackend()` and use it directly | Fastest call path | Bypasses HybridBackend's abstraction. Couples to internal structure. |

**Recommendation**: Option A. Patching HybridBackend to proxy these three methods is the cleanest solution. It maintains the abstraction that callers should use HybridBackend directly. The proxy is straightforward:

```js
async recordFeedback(queryId, quality) {
  return this.agentdbBackend?.recordFeedback?.(queryId, quality);
}
getWitnessChain() {
  return this.agentdbBackend?.getWitnessChain?.() ?? null;
}
async verifyWitnessChain() {
  return this.agentdbBackend?.verifyWitnessChain?.() ?? { valid: true, reason: 'no-agentdb' };
}
```

### R3: Fix the recordFeedback() ID Mismatch (fixes G3)

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Route searches through SelfLearningRvfBackend** | Make HybridBackend's `querySemantic()` call `SelfLearningRvfBackend.searchAsync()` which creates trajectory IDs, then return those IDs alongside search results | Correct learning pipeline — trajectories tracked end-to-end | Invasive change to HybridBackend's search path. Need to carry trajectory IDs through the entire MCP response. |
| **B: Use a different feedback API** | Instead of `recordFeedback(queryId)`, call `SelfLearningRvfBackend.tick()` with accumulated positive/negative samples, using the contrastive training path | Doesn't require trajectory tracking | Different learning mechanism. Need to call `addSample()` on the ContrastiveTrainer rather than the trajectory-based feedback. |
| **C: Track trajectory IDs in search results** | After `SelfLearningRvfBackend.searchAsync()`, stash the returned trajectory ID in `_recentSearchHits` alongside the entry ID | Clean mapping between entry IDs and trajectory IDs | Requires search to go through the learning backend (see R1 fix first). Requires the learning backend to expose trajectory IDs in search results. |
| **D: Accept entry-ID-based implicit learning** | Instead of using trajectory-based feedback, call the learning backend's contrastive trainer directly with embedding pairs (searched query + retrieved result = positive pair) | Works with the current data flow | Bypasses the SONA trajectory pipeline entirely. Loss of trajectory context. |

**Recommendation**: Option C, contingent on R1 being implemented first. Once SelfLearningRvfBackend is actually instantiated (R1), searches through it produce trajectory IDs. Store these alongside entry IDs in `_recentSearchHits`, then pass the trajectory ID to `recordFeedback()`.

If R1 cannot be implemented (e.g., the sub-path import breaks), fall back to **Option D**: direct contrastive training with embedding pairs. This provides learning value without the full trajectory pipeline.

### R4: Fix Witness Chain Access (fixes G5) — **Partially Superseded by R9**

> **Note (v2)**: R4's original recommendation (Option A: access via learningBackend) is now **superseded by R9** for primary tamper detection. The learning backend's witness chain tracks learning mutations, not data mutations. R4 remains valid as a **secondary** verification for learning chain auditing. See Bug 7 (section 1.9) and R9 for details.

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Access via SelfLearningRvfBackend** | After R1 fix, use `this.learningBackend.getWitnessChain()` and `this.learningBackend.verifyWitnessChain()` | Clean — uses the same object for learning and witness | **Wrong chain for tamper detection** — tracks learning mutations, not data mutations. See R9. |
| **B: Access via vectorBackend** | Use `this.agentdb.vectorBackend` (if accessible) which may be the RvfBackend | Direct access to the underlying RVF and the **correct** data mutation chain | AgentDB may not expose `vectorBackend` publicly. Need to verify. |
| **C: Store reference at init** | During `ensureAgentDBImport()`, store a reference to the RVF backend's witness chain methods | Works regardless of learning backend | Requires knowing the internal structure of AgentDB. Fragile. |

**Updated Recommendation**: Option B, now documented as **R9**. Use `this.agentdb.vectorBackend?.verifyWitness?.()` for primary tamper detection. Option A is retained as an optional secondary check for learning chain integrity.

### R5: Add tick() Loop (fixes G6)

The self-learning pipeline requires periodic `tick()` calls. Without them, even with correct feedback recording, the model never trains.

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: setInterval in AgentDBBackend** | After creating the learning backend, start `setInterval(() => this.learningBackend.tick(), tickIntervalMs)` | Simple, automatic | Runs even when no searches are happening. Must be cleared on shutdown. |
| **B: Tick after N feedback events** | Count feedback events, tick after every N (e.g., 10) | Learning only runs when there's data | Delays initial learning. Must maintain counter. |
| **C: Tick at session end** | Call `tick()` in the `doSync()` hook | Training happens once per session | Long sessions accumulate stale feedback. Single tick may be insufficient. |
| **D: A + C** | setInterval during session + forced tick at session end | Best coverage | Most complex. |

**Recommendation**: Option A with the interval from config (`learningTickInterval`, default 30000ms). This is what `SelfLearningRvfBackend` was designed for — the `tickIntervalMs` config exists precisely for this purpose. Clear the interval in `shutdown()`. Add a forced `tick()` in `doSync()` as a belt-and-suspenders measure.

### R6: Cap _recentSearchHits (fixes G9)

Add a max-size cap (e.g., 500 entries) with LRU eviction. When the Map exceeds the cap, delete the oldest entries.

```js
const MAX_SEARCH_HITS = 500;
if (_recentSearchHits.size > MAX_SEARCH_HITS) {
  const oldest = _recentSearchHits.keys().next().value;
  _recentSearchHits.delete(oldest);
}
```

This is a one-line addition to WM-009c.

### R7: Fix WM-011 Minor Issues (fixes G10, G11)

**G10 (zero-vector embeddings)**: Replace the all-zero `stateAfter` with a hash-based pseudo-embedding derived from the pattern content:

```js
const hash = createHash('sha256').update(JSON.stringify(params)).digest();
const stateAfter = new Float32Array(dim);
for (let i = 0; i < dim; i++) stateAfter[i] = (hash[i % hash.length] - 128) / 128;
```

This gives each pattern a unique embedding signature, enabling meaningful vector search.

**G11 (stale lazy-loader)**: Change the sentinel from `undefined` to a retry-on-null pattern:

```js
function getReasoningBankInstance() {
  // Re-check every time if previously unavailable
  if (reasoningBankRef === null) {
    try { reasoningBankRef = require('../memory/memory-initializer.js').getReasoningBank() || null; }
    catch { /* not available */ }
  }
  return reasoningBankRef;
}
```

### R8: Route Searches Through SelfLearningRvfBackend (fixes G19)

This is the **most critical recommendation** — without it, R1 through R5 are necessary but not sufficient. The learning pipeline requires searches to flow through `SelfLearningRvfBackend.searchAsync()` so that trajectories are created and SONA enhancement is applied.

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Patch AgentDBBackend.querySemantic()** | When `this.learningBackend` exists, delegate `querySemantic()` to `this.learningBackend.searchAsync()` with fallback to `this.agentdb.vectorBackend.search()` | Minimal change — one method override. All existing callers benefit automatically. | Learning backend uses different return format. Need to normalize results. |
| **B: Patch HybridBackend.querySemantic()** | Intercept at the HybridBackend level, routing to AgentDBBackend's learning path | Keeps AgentDBBackend simple | Wrong abstraction level — HybridBackend shouldn't know about learning. |
| **C: Replace vectorBackend reference** | At init time, replace `this.agentdb.vectorBackend` with the SelfLearningRvfBackend | All searches automatically go through learning | Monkey-patching AgentDB internals. Fragile. May break other vectorBackend consumers. |
| **D: Wrap at MCP level** | In memory-tools.js, call the learning backend directly for searches | Full control of the search→feedback pipeline | Bypasses HybridBackend entirely for search. Duplicates search logic. |

**Recommendation**: Option A. Patch `AgentDBBackend.querySemantic()` to check for `this.learningBackend` first:

```js
async querySemantic(query, options) {
  // Route through learning backend if available (creates trajectories for feedback)
  if (this.learningBackend) {
    try {
      const results = await this.learningBackend.searchAsync(query, options?.limit ?? 10);
      // Normalize: searchAsync returns { id, distance, metadata } format
      // Store trajectory ID for later feedback
      return results.map(r => ({
        id: r.id ?? r.metadata?.id,
        content: r.metadata?.content ?? '',
        similarity: 1 - (r.distance ?? 0),
        metadata: r.metadata,
        _trajectoryId: results._queryId  // Carry trajectory ID for R3
      }));
    } catch {
      // Fall through to plain search
    }
  }
  // Original path: plain RvfBackend search
  return this._originalQuerySemantic(query, options);
}
```

The `_trajectoryId` field on results enables R3 (ID mismatch fix) — when a result is subsequently retrieved, the trajectory ID can be passed to `recordFeedback()`.

**New patch**: This requires a new patch op in WM-008 (or a new WM-012 defect) targeting `agentdb-backend.js`.

### R9: Fix Witness Chain Access Path (fixes G20)

R4 (original analysis) proposed accessing the witness chain via `this.learningBackend`. This is **incorrect** — the learning backend's witness chain tracks learning mutations (SONA updates, solver iterations), not data mutations (inserts, deletes).

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Use `this.agentdb.vectorBackend.verifyWitness()`** | Access the RvfBackend directly through AgentDB's `vectorBackend` property | Validates the correct chain (data mutations). Method exists on RvfBackend. | Need to confirm `vectorBackend` is a public property of AgentDB. |
| **B: Use both chains** | Verify both the data chain (`vectorBackend.verifyWitness()`) and learning chain (`learningBackend.verifyWitnessChain()`) | Most thorough — detects both data tampering and learning tampering | More complex. Two chains to report on. May confuse callers. |
| **C: Expose chain through AgentDB controller** | Use `agentdb.getController('witness')` or similar | Uses public API | No evidence this controller exists. Would require agentdb changes. |

**Recommendation**: Option A, with Option B as a stretch goal. The primary tamper-detection use case requires validating the **data mutation chain**, which lives on the RvfBackend:

```js
async verifyWitnessChain() {
  try {
    // Primary: verify data mutation chain on RvfBackend
    const dataChain = this.agentdb?.vectorBackend?.verifyWitness?.();
    if (dataChain !== undefined) {
      return { valid: !!dataChain, chain: 'data', reason: dataChain ? 'intact' : 'broken' };
    }
    return { valid: true, reason: 'no-witness-chain' };
  } catch (e) {
    return { valid: false, reason: e.message, chain: 'data' };
  }
}
```

This replaces the current (non-functional) pattern that calls `this.agentdb.getWitnessChain()` and `this.agentdb.verifyWitnessChain()`.

**Impact on R4**: R4's recommendation to use `this.learningBackend` is superseded by R9. R4 should be implemented as a secondary verification (learning chain audit), not as the primary tamper detection mechanism.

### R10: No Immediate Action Required

These items are noted but do not require patches:

| Item | Why No Action |
|------|--------------|
| G7 (no negative feedback) | Positive-only feedback is a valid starting point. Negative signals are harder to define (absence of retrieval could mean irrelevance OR the agent found the answer elsewhere). Can add later. |
| G12 (no .db to .rvf migration) | New installs use .rvf directly. Existing users are rare (the memory system was never functional upstream). A migration tool can be added if needed. |
| G13-G18 (documentation) | Important but not blocking. Should be updated alongside the code fixes. |

---

## 5. Implementation Order

All fixes should be done together since they address a single coherent feature set. The dependency graph is:

```
R1 (fix import) ──┬── R8 (route searches) ── R3 (fix ID mismatch) ── R5 (tick loop)
                   │
                   ├── R9 (fix witness chain access)
                   │
                   └── R2 (HybridBackend proxies)
```

Ordered sequence:

1. **R1** (fix SelfLearningRvfBackend import) — unblocks everything else
2. **R8** (route searches through learning backend) — **critical path** — without this, R1 alone is insufficient. Must be done immediately after R1.
3. **R2** (HybridBackend proxy methods) — enables callers to reach the backend
4. **R9** (fix witness chain access to use `vectorBackend.verifyWitness()`) — replaces original R4 for primary tamper detection. R4 becomes secondary (learning chain audit).
5. **R5** (add tick() loop) — depends on R1
6. **R3** (fix recordFeedback ID mismatch) — depends on R1 + R8 (trajectory IDs now available via `_trajectoryId` on search results)
7. **R6** (cap _recentSearchHits) — independent
8. **R7** (WM-011 minor fixes) — independent

**Key insight**: R8 is the linchpin. R1 makes the learning backend **exist**; R8 puts it **in the search path**. Without both, no learning happens. R3's ID mismatch fix is now much simpler because R8 carries trajectory IDs through search results.

Estimated scope: ~200 lines of new patch ops across 4-5 files.

---

## 6. AgentDB v3 Features We Should NOT Wire

The upstream source analysis revealed 12+ additional AgentDB v3 capabilities. Not all should be wired.

| Feature | Should Wire? | Rationale |
|---------|-------------|-----------|
| SelfLearningRvfBackend + tick() | **Yes** (R1, R5) | Core value proposition — search quality improves 36% |
| Witness chain verification | **Yes** (R2, R4) | Low-cost tamper detection |
| recordFeedback() | **Yes** (R2, R3) | Completes the learning loop |
| ReflexionMemory controller | No | Intelligence.cjs already provides episode-like learning. Would be redundant. |
| SkillLibrary controller | No | No skill extraction pipeline exists. Would be orphaned. |
| CausalMemoryGraph | No | Requires explicit cause-effect annotations. No source of this data in the current architecture. |
| NightlyLearner | No | Designed for batch processing during downtime. Claude Code sessions are short-lived; no "nightly" window. |
| ExplainableRecall | No | Merkle proofs and provenance certificates add latency with no consumer in the current UX. |
| LearningSystem (9 RL algorithms) | No | Over-engineered for the current use case. SelfLearningRvfBackend already includes solver-based learning. |
| 5-tier temporal compression | No | The RVF auto-tiering works internally. No configuration needed. |
| Federated session aggregation | No | Single-user tool. No federation target. |
| ContrastiveTrainer (direct use) | Maybe (R3 Option D) | Only if trajectory-based feedback cannot be fixed. |

---

## 7. Version Discrepancy Note

The WM-008 patch targets `agentdb@3.0.0-alpha.3`. However:

- npm `latest` tag points to `2.0.0-alpha.3.3`
- npm `alpha` tag points to `2.0.0-alpha.2.21`
- `3.0.0-alpha.3` exists but has no dist-tag (must be installed explicitly)
- The version `3.0.0-alpha.3` was published ~3 days ago

The `fix.sh` script handles this correctly by using `npm pack agentdb@3.0.0-alpha.3` with explicit version. The npm `latest` mismatch is not a problem because we pin the exact version.

However, the v3 package.json **still lists heavy dependencies** (including `hnswlib-node`, `sqlite3`, `better-sqlite3` as optional) despite the README claiming "5 deps." The dependency reduction may not be as dramatic as advertised. The key improvement is that native deps are **optional** (sql.js WASM is the default), not eliminated.

---

## 8. ADR Validity Summary

| ADR | Status | Action Needed |
|-----|--------|--------------|
| ADR-001 (Use HybridBackend directly) | **Valid** | None |
| ADR-002 (Fail loud, no silent fallback) | **Valid** | None |
| ADR-003 (Separate database files) | **Valid but incomplete** | Add a note about namespace-isolated shared RVF files (WM-011 pattern) |
| ADR-004 (Embedding generator wrapping) | **Valid** | None |
| ADR-005 (Config priority chain) | **Stale** | Update for config.json migration or supersede |
| ADR-006 (Concurrent access busy_timeout) | **Partially stale** | Review RVF concurrency model |
| ADR-007 (No embeddings on hook path) | **Valid** | WM-011 correctly avoids hook path |

---

## Appendix A: Two ReasoningBank Classes

There are two completely different classes named `ReasoningBank`:

**A. `agentdb` package** (`agentdb/dist/src/controllers/ReasoningBank.js`)
- SQL-based pattern store with `reasoning_patterns` + `pattern_embeddings` tables
- Constructor: `(db, embedder, vectorBackend?, learningBackend?)`
- Methods: `storePattern()`, `searchPatterns()`, `recordOutcome()`, `trainGNN()`
- Accessible via `agentdb.getController('reasoning')` or direct import

**B. `@claude-flow/neural` package** (`@claude-flow/neural/dist/reasoning-bank.js`)
- Trajectory-based 4-step pipeline: RETRIEVE, JUDGE, DISTILL, CONSOLIDATE
- Constructor: `(config?: Partial<ReasoningBankConfig>)`
- Methods: `storeTrajectory()`, `judge()`, `distill()`, `consolidate()`, `retrieveByContent()`
- Creates its own internal AgentDB instance

WM-011 correctly uses class B. Class A is more suited for direct pattern CRUD operations; class B is designed for the kind of trajectory-to-pattern distillation that hook handlers need.

## Appendix B: Files That Need Modification

| File | What Changes | For |
|------|-------------|-----|
| `@claude-flow/memory/dist/agentdb-backend.js` | Fix SelfLearningRvfBackend import (R1), **route querySemantic() through learning backend (R8)**, fix witness chain to use `vectorBackend.verifyWitness()` (R9), add tick interval (R5) | WM-008 bugfixes + R8/R9 |
| `@claude-flow/memory/dist/hybrid-backend.js` | Add proxy methods for recordFeedback/verifyWitnessChain (R2) | New patch target |
| `memory/memory-initializer.js` | Fix delegation to use getAgentDBBackend() (R2 alt), or just let HybridBackend proxy handle it | WM-009 bugfix |
| `mcp-tools/memory-tools.js` | Fix ID mapping to use `_trajectoryId` from search results (R3), cap Map size (R6) | WM-009 bugfix |
| `init/helpers-generator.js` | Fix delegation for witness chain verification (R2, R9) | WM-010 bugfix |
| `mcp-tools/hooks-tools.js` | Fix lazy-loader (R7), fix zero-vector (R7) | WM-011 bugfix |

### Key change from v1 analysis

The original Appendix B listed `agentdb-backend.js` as needing R4 (witness chain via learningBackend). This is now **R9** (witness chain via `vectorBackend.verifyWitness()`) — a different target method and different semantics. R4 is demoted to secondary (learning chain audit, optional).
