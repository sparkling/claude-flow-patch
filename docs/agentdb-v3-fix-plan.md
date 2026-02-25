# AgentDB v3 Fix Plan — Implementation Specification

**Date**: 2026-02-25
**Implements**: R1-R9 from `docs/agentdb-v3-integration-analysis.md` (v2)
**Scope**: Fix 7 bugs across 4-5 files, add E2E tests proving storage + retrieval + learning pipeline

---

## 1. Summary

Seven bugs render 3 of 4 AgentDB v3 patches non-functional. This plan fixes all of them
in a single pass. No phases — all changes land together.

| Bug | Fix | File(s) | New Defect? |
|-----|-----|---------|-------------|
| SelfLearningRvfBackend not imported (G1) | R1: Sub-path import via `agentdb/backends/self-learning` | agentdb-backend.js | Amend WM-008 |
| Searches bypass learning backend (G19) | R8: Route `querySemantic()` through `searchAsync()` | agentdb-backend.js | Amend WM-008 |
| HybridBackend missing proxy methods (G2,G4,G8) | R2: Add proxy methods | hybrid-backend.js | **New: WM-012** |
| Witness chain targets wrong object (G5,G20) | R9: Use `vectorBackend.verifyWitness()` | agentdb-backend.js | Amend WM-008 |
| recordFeedback() ID mismatch (G3) | R3: Carry `_trajectoryId` from search results | memory-tools.js | Amend WM-009 |
| No tick() loop (G6) | R5: `setInterval` + shutdown cleanup | agentdb-backend.js | Amend WM-008 |
| _recentSearchHits unbounded (G9) | R6: LRU cap at 500 | memory-tools.js | Amend WM-009 |
| Zero-vector embeddings (G10) | R7a: Hash-based pseudo-embedding | hooks-tools.js | Amend WM-011 |
| Stale lazy-loader (G11) | R7b: Retry-on-null pattern | hooks-tools.js | Amend WM-011 |

---

## 2. New Defect: WM-012

R2 requires patching `hybrid-backend.js` — a new target file. This gets its own defect.

```
Directory: patch/600-WM-012-hybrid-backend-proxies/
GitHub issue: Create new (search first for existing)
Severity: High
```

### WM-012 path variable

Add to `lib/common.py`:

```python
HYBRID_BACKEND = os.path.join(_cf_scope, "memory", "dist", "hybrid-backend.js") if _cf_scope else ""
```

### WM-012 fix.py — 3 ops

**WM-012a**: Add `recordFeedback()` proxy to HybridBackend

```python
patch("WM-012a: Add recordFeedback proxy to HybridBackend",
    HYBRID_BACKEND,
    """getAgentDBBackend() {
        return this.agentdb;
    }""",
    """getAgentDBBackend() {
        return this.agentdb;
    }
    // WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }""")
```

**WM-012b**: Add `verifyWitnessChain()` proxy

```python
patch("WM-012b: Add verifyWitnessChain proxy to HybridBackend",
    HYBRID_BACKEND,
    """// WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }""",
    """// WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }
    // WM-012b: Proxy verifyWitnessChain to AgentDBBackend for tamper detection
    async verifyWitnessChain() {
        if (this.agentdb && typeof this.agentdb.verifyWitnessChain === 'function') {
            return await this.agentdb.verifyWitnessChain();
        }
        return { valid: true, reason: 'no-agentdb-backend' };
    }
    // WM-012c: Proxy getWitnessChain to AgentDBBackend
    getWitnessChain() {
        if (this.agentdb && typeof this.agentdb.getWitnessChain === 'function') {
            return this.agentdb.getWitnessChain();
        }
        return null;
    }""")
```

**Note**: WM-012b is a dependent patch op — it uses WM-012a's inserted text as its old_string. This means WM-012a must apply first (guaranteed by being in the same fix.py in order).

### WM-012 sentinel

```
grep "WM-012a: Proxy recordFeedback" hybrid-backend.js
grep "WM-012b: Proxy verifyWitnessChain" hybrid-backend.js
package: @claude-flow/memory
```

Sentinel paths are relative to `@claude-flow/memory/dist/`.

---

## 3. Amended Defects

### 3.1 WM-008 Amendments (R1, R8, R9, R5)

Add 4 new ops to `patch/560-WM-008-agentdb-v3-upgrade/fix.py`:

**WM-008p (R1): Fix SelfLearningRvfBackend import path**

The current import `SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend` gets `undefined` because the class isn't re-exported from the main entry. AgentDB v3's `package.json` exports map includes `"./backends/self-learning"` pointing to the correct file.

```python
patch("WM-008p: Fix SelfLearningRvfBackend import via sub-path (R1)",
    AGENTDB_BACKEND,
    """// WM-008c: Import SelfLearningRvfBackend (v3-only, undefined on v2)
                SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;""",
    """// WM-008c: Import SelfLearningRvfBackend (v3-only, undefined on v2)
                SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;
                // WM-008p (R1): Fallback to sub-path import (not in main exports)
                if (!SelfLearningRvfBackend) {
                    try {
                        const slrMod = await import('agentdb/backends/self-learning');
                        SelfLearningRvfBackend = slrMod.SelfLearningRvfBackend || slrMod.default;
                    } catch (_slrErr) { /* agentdb v2 or sub-path unavailable */ }
                }""")
```

**WM-008q (R8): Route querySemantic through SelfLearningRvfBackend**

The existing `search()` method on AgentDBBackend calls `this.agentdb.vectorBackend.search()` which is the plain RvfBackend. We need to intercept and route through `this.learningBackend.searchAsync()` when available. This creates trajectory entries (`q_N` IDs) needed for the feedback loop.

Find the existing `search()` method in AgentDBBackend and add learning-backend routing. The exact old_string must match the current (already-patched) code.

```python
patch("WM-008q: Route search through SelfLearningRvfBackend for trajectory tracking (R8)",
    AGENTDB_BACKEND,
    """async search(embedding, options = {}) {
        await ensureAgentDBImport();
        if (!this.agentdb) {
            throw new Error('AgentDB not initialized');
        }""",
    """async search(embedding, options = {}) {
        await ensureAgentDBImport();
        if (!this.agentdb) {
            throw new Error('AgentDB not initialized');
        }
        // WM-008q (R8): Route through learning backend if available
        if (this.learningBackend) {
            try {
                const k = options.k || 10;
                const lbResults = await this.learningBackend.searchAsync(embedding, k, options);
                if (lbResults && lbResults.length > 0) {
                    // Extract trajectory ID from learning backend's internal counter
                    const trajId = lbResults._queryId || null;
                    return lbResults.map(r => ({
                        entry: { id: r.id, content: r.metadata?.content, namespace: r.metadata?.namespace,
                                 key: r.metadata?.key, tags: r.metadata?.tags || [], type: r.metadata?.type,
                                 embedding: null, createdAt: r.metadata?.createdAt, updatedAt: r.metadata?.updatedAt },
                        score: r.similarity ?? (1 - (r.distance ?? 0)),
                        _trajectoryId: trajId,
                    }));
                }
            } catch (_lbErr) { /* Fall through to plain search */ }
        }""")
```

**WM-008r (R9): Fix witness chain verification to use vectorBackend.verifyWitness()**

The current code calls `this.agentdb.verifyWitnessChain()` which doesn't exist. The correct path is `this.agentdb.vectorBackend?.verifyWitness?.()` — the `verifyWitness()` method on `RvfBackend` validates the SHAKE-256 data mutation chain.

```python
patch("WM-008r: Fix verifyWitnessChain to use vectorBackend.verifyWitness() (R9)",
    AGENTDB_BACKEND,
    """async verifyWitnessChain() {
        if (!this.agentdb) return { valid: false, reason: 'agentdb not initialized' };
        if (typeof this.agentdb.verifyWitnessChain === 'function') {
            try { return await this.agentdb.verifyWitnessChain(); } catch (e) { return { valid: false, reason: String(e) }; }
        }
        return { valid: false, reason: 'witness chain not available (requires agentdb v3)' };
    }""",
    """async verifyWitnessChain() {
        if (!this.agentdb) return { valid: false, reason: 'agentdb not initialized' };
        // WM-008r (R9): Use vectorBackend.verifyWitness() for data mutation chain
        const vb = this.agentdb.vectorBackend;
        if (vb && typeof vb.verifyWitness === 'function') {
            try {
                const result = vb.verifyWitness();
                return { valid: !!result?.valid, entries: result?.entries || 0, chain: 'data', reason: result?.valid ? 'intact' : (result?.error || 'broken') };
            } catch (e) { return { valid: false, reason: String(e), chain: 'data' }; }
        }
        // Fallback: try learning backend's chain (tracks learning mutations)
        if (this.learningBackend && typeof this.learningBackend.verifyWitnessChain === 'function') {
            try {
                const lr = this.learningBackend.verifyWitnessChain();
                return { valid: !!lr?.valid, entries: lr?.entryCount || 0, chain: 'learning', reason: lr?.valid ? 'intact' : 'broken' };
            } catch (e) { return { valid: false, reason: String(e), chain: 'learning' }; }
        }
        return { valid: true, reason: 'no witness chain available', chain: 'none' };
    }""")
```

**WM-008s (R5): Add tick() loop for self-learning**

After the learning backend is created (WM-008d), start a periodic tick interval. Clear it on shutdown.

```python
patch("WM-008s: Add tick() loop for SelfLearningRvfBackend (R5)",
    AGENTDB_BACKEND,
    """// WM-008b: Destroy learning backend if active
if (this.learningBackend) {
    try { await this.learningBackend.destroy(); } catch {}
    this.learningBackend = null;
}""",
    """// WM-008s (R5): Run final tick before shutdown
if (this.learningBackend) {
    try { await this.learningBackend.tick(); } catch {}
}
// WM-008s (R5): Clear tick interval
if (this._tickInterval) {
    clearInterval(this._tickInterval);
    this._tickInterval = null;
}
// WM-008b: Destroy learning backend if active
if (this.learningBackend) {
    try { await this.learningBackend.destroy(); } catch {}
    this.learningBackend = null;
}""")
```

And start the interval after learning backend creation:

```python
patch("WM-008s2: Start tick interval after learning backend creation (R5)",
    AGENTDB_BACKEND,
    """} catch (learnErr) {
                        // Non-fatal: self-learning is an optional enhancement
                    }""",
    """// WM-008s2 (R5): Start periodic tick loop for learning
                        if (this.learningBackend) {
                            const tickMs = this.config.learningTickInterval || 30000;
                            this._tickInterval = setInterval(() => {
                                this.learningBackend?.tick?.().catch(() => {});
                            }, tickMs);
                            if (this._tickInterval.unref) this._tickInterval.unref();
                        }
                    } catch (learnErr) {
                        // Non-fatal: self-learning is an optional enhancement
                    }""")
```

**WM-008t: Fix getWitnessChain to use vectorBackend (R9 complement)**

```python
patch("WM-008t: Fix getWitnessChain to use vectorBackend (R9)",
    AGENTDB_BACKEND,
    """getWitnessChain() {
        if (!this.agentdb) return null;
        if (typeof this.agentdb.getWitnessChain === 'function') {
            try { return this.agentdb.getWitnessChain(); } catch { return null; }
        }
        return null;
    }""",
    """getWitnessChain() {
        if (!this.agentdb) return null;
        // WM-008t (R9): Use vectorBackend for data chain, learning backend for learning chain
        const vb = this.agentdb.vectorBackend;
        if (vb && typeof vb.verifyWitness === 'function') {
            try { return vb.verifyWitness(); } catch {}
        }
        if (this.learningBackend && typeof this.learningBackend.getWitnessChain === 'function') {
            try { return this.learningBackend.getWitnessChain(); } catch {}
        }
        return null;
    }""")
```

### WM-008 Updated Sentinels

Add to the existing sentinel file:

```
grep "WM-008p (R1): Fallback to sub-path import" agentdb-backend.js
grep "WM-008q (R8): Route through learning backend" agentdb-backend.js
grep "WM-008r (R9): Use vectorBackend.verifyWitness" agentdb-backend.js
grep "WM-008s (R5): Run final tick" agentdb-backend.js
package: @claude-flow/memory
```

---

### 3.2 WM-009 Amendments (R3, R6)

Add 2 new ops to `patch/570-WM-009-agentdb-learning-loop/fix.py`:

**WM-009e (R3): Use trajectory ID from search results for recordFeedback**

The current code passes `r.id` (entry UUID) to `_recentSearchHits`. After R8 routes searches through the learning backend, search results carry `_trajectoryId`. We need to store that trajectory ID instead.

```python
patch("WM-009e: Track trajectory ID (not entry ID) for learning feedback (R3)",
    MCP_MEMORY,
    """// WM-009c: Track entry ID for implicit feedback on later retrieve
if (r.id && r.key) {
    const ns = r.namespace || 'default';
    _recentSearchHits.set(`${ns}:${r.key}`, r.id);
}""",
    """// WM-009e (R3): Track trajectory ID for learning feedback (falls back to entry ID)
if (r.key) {
    const ns = r.namespace || 'default';
    const trackId = r._trajectoryId || r.id;
    if (trackId) _recentSearchHits.set(`${ns}:${r.key}`, trackId);
}""")
```

**WM-009f (R6): Cap _recentSearchHits at 500 entries**

```python
patch("WM-009f: Cap _recentSearchHits at 500 entries (R6)",
    MCP_MEMORY,
    """const _recentSearchHits = new Map();""",
    """const _recentSearchHits = new Map();
const _SEARCH_HITS_MAX = 500;""")
```

And add the eviction after each set:

```python
patch("WM-009g: Evict oldest search hits when over cap (R6)",
    MCP_MEMORY,
    """if (trackId) _recentSearchHits.set(`${ns}:${r.key}`, trackId);""",
    """if (trackId) {
    _recentSearchHits.set(`${ns}:${r.key}`, trackId);
    // WM-009g (R6): LRU eviction
    if (_recentSearchHits.size > _SEARCH_HITS_MAX) {
        const oldest = _recentSearchHits.keys().next().value;
        _recentSearchHits.delete(oldest);
    }
}""")
```

### WM-009 Updated Sentinels

Add:

```
grep "_trajectoryId" memory-tools.js
grep "_SEARCH_HITS_MAX" memory-tools.js
```

---

### 3.3 WM-011 Amendments (R7a, R7b)

Add 2 new ops to `patch/590-WM-011-reasoning-bank-controller/fix.py`:

**WM-011e (R7a): Replace zero-vector with hash-based pseudo-embedding**

```python
patch("WM-011e: Hash-based pseudo-embedding instead of zero-vector (R7a)",
    MCP_HOOKS,
    """stateAfter: new Float32Array(rb.config?.vectorDimension || 768),""",
    """stateAfter: (() => { const { createHash } = require('node:crypto');
                        const dim = rb.config?.vectorDimension || 768;
                        const h = createHash('sha256').update(pattern + type + timestamp).digest();
                        const arr = new Float32Array(dim);
                        for (let i = 0; i < dim; i++) arr[i] = (h[i % h.length] - 128) / 128;
                        return arr; })(),""")
```

**WM-011f (R7b): Fix lazy-loader to retry when null**

```python
patch("WM-011f: Retry-on-null ReasoningBank lazy loader (R7b)",
    MCP_HOOKS,
    """// WM-011b: ReasoningBank lazy loader
let reasoningBankRef = null;
async function getReasoningBankInstance() {
    if (reasoningBankRef === null) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            reasoningBankRef = undefined;
        }
    }
    return reasoningBankRef || null;
}""",
    """// WM-011b: ReasoningBank lazy loader
// WM-011f (R7b): Retry when unavailable (don't permanently cache null)
let reasoningBankRef = undefined;
async function getReasoningBankInstance() {
    if (!reasoningBankRef) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            // Not available yet — will retry on next call
        }
    }
    return reasoningBankRef || null;
}""")
```

### WM-011 Updated Sentinels

Add:

```
grep "hash-based pseudo-embedding" hooks-tools.js
grep "WM-011f (R7b): Retry when unavailable" hooks-tools.js
```

---

## 4. Dependency Order

All fixes are in the same execution order chain. Within the existing WM-008/009/011 fix.py files, new ops run sequentially after existing ops. WM-012 gets order 600 (after WM-011 at 590).

```
WM-008 (560): Existing 15 ops + 6 new ops (p, q, r, s, s2, t)
WM-009 (570): Existing 4 ops + 3 new ops (e, f, g)
WM-010 (580): No changes (witness chain call now works via WM-012 proxy)
WM-011 (590): Existing 6 ops + 2 new ops (e, f)
WM-012 (600): 2 new ops (a, b) — NEW DEFECT
```

Inter-defect dependency: WM-008p (R1) must apply before WM-008q (R8) — guaranteed by order within fix.py.

---

## 5. Test Plan

### 5.1 Unit Tests — Patch Application (tests/03-patch-apply.test.mjs)

Add rows to the `TESTS` array for new patch ops:

| Patch Op | Fixture File | Old String Marker | New String Marker |
|----------|-------------|-------------------|-------------------|
| WM-008p | agentdb-backend.js | `SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;` | `agentdb/backends/self-learning` |
| WM-008q | agentdb-backend.js | `async search(embedding, options = {})` | `WM-008q (R8): Route through learning backend` |
| WM-008r | agentdb-backend.js | `async verifyWitnessChain()` | `vectorBackend.verifyWitness` |
| WM-008s | agentdb-backend.js | `Destroy learning backend` | `Run final tick before shutdown` |
| WM-008t | agentdb-backend.js | `getWitnessChain()` | `WM-008t (R9)` |
| WM-009e | memory-tools.js | `Track entry ID for implicit feedback` | `Track trajectory ID` |
| WM-009f | memory-tools.js | `new Map()` | `_SEARCH_HITS_MAX` |
| WM-011e | hooks-tools.js | `new Float32Array(rb.config` | `hash-based pseudo-embedding` |
| WM-011f | hooks-tools.js | `let reasoningBankRef = null` | `Retry when unavailable` |
| WM-012a | hybrid-backend.js | `getAgentDBBackend()` | `Proxy recordFeedback` |
| WM-012b | hybrid-backend.js | `Proxy recordFeedback` | `Proxy verifyWitnessChain` |

### 5.2 Idempotency Tests (tests/04-idempotency.test.mjs)

Add rows to the `PATCHES` array for each new defect/amended defect.

### 5.3 Fixture Files Required

Create or update these fixture files in `tests/fixtures/`:

| Fixture | Contents |
|---------|----------|
| `tests/fixtures/memory/dist/agentdb-backend.js` | Contains the OLD strings that WM-008p/q/r/s/s2/t replace. These must match the state AFTER existing WM-008a-o have applied. |
| `tests/fixtures/memory/dist/hybrid-backend.js` | Contains the `getAgentDBBackend()` method that WM-012a matches against. |

Existing fixtures that need updating:
| Fixture | Update |
|---------|--------|
| `tests/fixtures/cli/dist/src/mcp-tools/memory-tools.js` | Add WM-009c old_string so WM-009e can match |
| `tests/fixtures/cli/dist/src/mcp-tools/hooks-tools.js` | Add WM-011b old_string so WM-011f can match |

### 5.4 Integration Tests — Cross-Defect (tests/27-cross-defect-integration.test.mjs)

Add new describe blocks:

**Suite: WM-008 self-learning backend instantiation (R1)**
- Test that `SelfLearningRvfBackend` can be imported from `agentdb/backends/self-learning`
- Test that AgentDBBackend creates a learning backend when `enableLearning: true`
- Test that `learningBackend` has `searchAsync`, `recordFeedback`, `tick` methods

**Suite: WM-012 HybridBackend proxy methods (R2)**
- Test that `HybridBackend.recordFeedback()` exists after patch
- Test that `HybridBackend.verifyWitnessChain()` exists after patch
- Test that `HybridBackend.getWitnessChain()` exists after patch

### 5.5 E2E Functional Tests — Full Pipeline

**New file: `tests/28-agentdb-v3-e2e.test.mjs`**

This is the critical test file. It proves the entire learning pipeline works end-to-end:
storage -> search (via learning backend) -> retrieve -> feedback -> tick -> improved search.

```
describe('E2E: AgentDB v3 self-learning pipeline', { skip: nativeDepsUnavailable })
```

**Test 1: Store and retrieve via HybridBackend**
```
- Create HybridBackend with v3 config (vectorBackend: 'rvf', enableLearning: true)
- Store 5 entries with different content and namespaces
- Retrieve each by key — assert content matches
- Assert: basic storage/retrieval works
```

**Test 2: Semantic search returns results**
```
- Use the same HybridBackend from Test 1
- Search with a query related to stored content
- Assert: results are non-empty
- Assert: results have similarity scores > 0
```

**Test 3: Search results carry _trajectoryId when learning backend is active**
```
- Get the AgentDBBackend via backend.getAgentDBBackend()
- Check if learningBackend is non-null (if agentdb v3 SelfLearningRvfBackend imported)
- If yes: call agentdbBackend.search() directly
- Assert: results have _trajectoryId field (format: q_N)
- If no: skip with message "SelfLearningRvfBackend not available"
```

**Test 4: recordFeedback() accepts trajectory IDs**
```
- After search from Test 3, extract a _trajectoryId
- Call backend.recordFeedback(trajectoryId, 1.0)
- Assert: no exception thrown
- (Learning effect is statistical — can't assert exact improvement in a single test)
```

**Test 5: Witness chain verification**
```
- Call backend.verifyWitnessChain()
- Assert: result has { valid: boolean }
- Assert: result.chain is 'data' or 'learning' or 'none'
- Store a new entry, verify chain again
- Assert: entries count increased (if chain is 'data')
```

**Test 6: tick() runs without error**
```
- Get agentdbBackend
- If learningBackend exists:
  - Call learningBackend.tick()
  - Assert: no exception
  - Call learningBackend.getLearningStats()
  - Assert: stats object has expected shape
```

**Test 7: ReasoningBank pattern store + retrieve (WM-011)**
```
- Import getReasoningBank from memory-initializer.js
- If available:
  - Store a trajectory with storeTrajectory()
  - Call distill() on the trajectory
  - Call retrieveByContent() with related query
  - Assert: results include the stored pattern
```

**Test 8: Full round-trip: store -> search -> retrieve -> feedback -> verify**
```
- Create fresh HybridBackend
- Store 10 entries with embeddings
- Search for related content
- Assert: results non-empty
- Retrieve top result by key
- Assert: content matches
- Record feedback with trajectory ID
- Verify witness chain
- Assert: chain is valid
- Shutdown cleanly
- Assert: no leftover intervals (tick cleared)
```

**Test 9: _recentSearchHits cap works**
```
- Import memory-tools.js
- Trigger >500 search operations
- Assert: _recentSearchHits.size <= 500
```

**Test 10: Lazy-loader retry (WM-011f)**
```
- Call getReasoningBankInstance() before memory init
- Assert: returns null (not permanently cached)
- Initialize memory
- Call getReasoningBankInstance() again
- Assert: returns ReasoningBank instance (if @claude-flow/neural available)
```

---

## 6. Files Modified (Complete List)

### Patch Files (create or modify)

| File | Action | Changes |
|------|--------|---------|
| `lib/common.py` | **Edit** | Add `HYBRID_BACKEND` variable (1 line) |
| `patch/560-WM-008-agentdb-v3-upgrade/fix.py` | **Edit** | Add 6 new ops (p, q, r, s, s2, t) |
| `patch/560-WM-008-agentdb-v3-upgrade/sentinel` | **Edit** | Add 4 new grep checks |
| `patch/560-WM-008-agentdb-v3-upgrade/README.md` | **Edit** | Update ops count, add R1/R5/R8/R9 descriptions |
| `patch/570-WM-009-agentdb-learning-loop/fix.py` | **Edit** | Add 3 new ops (e, f, g) |
| `patch/570-WM-009-agentdb-learning-loop/sentinel` | **Edit** | Add 2 new grep checks |
| `patch/570-WM-009-agentdb-learning-loop/README.md` | **Edit** | Update ops count, add R3/R6 descriptions |
| `patch/590-WM-011-reasoning-bank-controller/fix.py` | **Edit** | Add 2 new ops (e, f) |
| `patch/590-WM-011-reasoning-bank-controller/sentinel` | **Edit** | Add 2 new grep checks |
| `patch/590-WM-011-reasoning-bank-controller/README.md` | **Edit** | Update ops count, add R7a/R7b descriptions |
| `patch/600-WM-012-hybrid-backend-proxies/fix.py` | **Create** | 2 ops (a, b) |
| `patch/600-WM-012-hybrid-backend-proxies/sentinel` | **Create** | 2 grep checks |
| `patch/600-WM-012-hybrid-backend-proxies/README.md` | **Create** | Full defect report |

### Test Files (create or modify)

| File | Action | Changes |
|------|--------|---------|
| `tests/fixtures/memory/dist/agentdb-backend.js` | **Create** | Fixture with post-WM-008a-o state for new ops |
| `tests/fixtures/memory/dist/hybrid-backend.js` | **Create** | Fixture with getAgentDBBackend() for WM-012 |
| `tests/fixtures/cli/dist/src/mcp-tools/memory-tools.js` | **Edit** | Add WM-009c output strings |
| `tests/fixtures/cli/dist/src/mcp-tools/hooks-tools.js` | **Edit** | Add WM-011b output strings |
| `tests/03-patch-apply.test.mjs` | **Edit** | Add 11 rows to TESTS array |
| `tests/04-idempotency.test.mjs` | **Edit** | Add rows for new/amended patches |
| `tests/27-cross-defect-integration.test.mjs` | **Edit** | Add 2 new describe blocks (R1 import, R2 proxies) |
| `tests/28-agentdb-v3-e2e.test.mjs` | **Create** | 10 E2E functional tests |

### Documentation

| File | Action | Changes |
|------|--------|---------|
| `docs/agentdb-v3-integration-analysis.md` | No change | Already updated in v2 |

### Post-Change

```bash
npm run preflight    # Regenerate doc tables (defect count goes from 60 to 61)
bash patch-all.sh    # Apply all patches including new ops
bash patch-all.sh    # Verify idempotency
bash check-patches.sh  # Verify all sentinels
npm test             # Run all tests including new E2E
```

---

## 7. GitHub Issue for WM-012

Search first:
```bash
gh issue list --repo ruvnet/claude-flow --search "HybridBackend proxy recordFeedback verifyWitnessChain" --limit 5
```

If none found, create:
```
Title: Bug: HybridBackend doesn't proxy recordFeedback/verifyWitnessChain to AgentDBBackend
Body: HybridBackend exposes getAgentDBBackend() but doesn't proxy learning/witness methods.
      Callers must know about the two-layer architecture. Fix: add 3 proxy methods.
```

---

## 8. Estimated Scope

| Area | Lines |
|------|-------|
| New patch ops (fix.py additions) | ~180 |
| New sentinels | ~15 |
| lib/common.py | 1 |
| WM-012 defect (fix.py + sentinel + README) | ~80 |
| Test fixtures | ~200 |
| Unit test additions (03, 04) | ~60 |
| Integration test additions (27) | ~80 |
| E2E test file (28) | ~350 |
| README updates | ~30 |
| **Total** | **~1,000 lines** |

---

## 9. Verification Criteria

The implementation is complete when:

1. `bash patch-all.sh` applies all patches (including new ops) without WARN
2. `bash patch-all.sh` (second run) reports 0 applied, all already present
3. `bash check-patches.sh` reports OK for all sentinels (including new ones)
4. `npm test` passes all tests (existing + new)
5. E2E test `28-agentdb-v3-e2e.test.mjs` proves:
   - Storage works (HybridBackend -> AgentDB v3 RVF)
   - Retrieval works (by key and by semantic search)
   - Search results carry `_trajectoryId` when learning backend is active
   - `recordFeedback()` accepts trajectory IDs without error
   - Witness chain verification uses correct chain (`vectorBackend.verifyWitness()`)
   - `tick()` runs without error
   - ReasoningBank store/retrieve works
   - Full round-trip: store -> search -> retrieve -> feedback -> verify
   - `_recentSearchHits` respects the 500 cap
   - Lazy-loader retries when previously unavailable
6. `npm run preflight` regenerates docs with correct defect count (61)
