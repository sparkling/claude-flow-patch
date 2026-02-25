# Guidance Memory Alignment Implementation Plan

Date: 2026-02-25
ADR: [ADR-010](adr/ADR-010-trust-boundary-alignment.md)
Analysis: [guidance-memory-alignment.md](guidance-memory-alignment.md)

---

## Overview

Implements the 5 alignment recommendations from the alignment analysis:
- R1: Mandatory MemoryWriteGateHook write gate
- R2: Trust-aware search ranking
- R3: Production AgentDBEmbeddingProvider
- R4: Separate governance RVF
- R5: Cross-system integration tests

---

## Phase 1: Mandatory Write Gate (WM-014)

### Defect: WM-014 -- Wire MemoryWriteGateHook as mandatory pre-write gate

**Severity**: High
**GitHub issue**: (to be created)
**Target files**: `mcp-tools/memory-tools.js` (MCP_MEMORY), auto-memory-hook.mjs

### Patch Operations

**WM-014a: Add write gate module state to memory-initializer.js**

In `memory/memory-initializer.js` (path var MI), add after the _hybridBackend declaration:
```javascript
let _writeGate = null;
export function setWriteGate(gate) { _writeGate = gate; }
export function getWriteGate() { return _writeGate; }
```

Export setWriteGate and getWriteGate from the default export object.

**WM-014b: Gate storeEntry in memory-initializer.js**

In the storeEntry function, BEFORE the HybridBackend store/update calls, add:
```javascript
if (_writeGate) {
  const decision = await _writeGate.checkWrite({
    key: entry.key || key,
    namespace: entry.namespace || namespace,
    value: entry.content || value,
    agentId: entry.author_id || 'anonymous',
  });
  if (!decision.allowed) {
    return { success: false, gated: true, reason: decision.reason, contradictions: decision.contradictions };
  }
}
```

**WM-014c: Initialize write gate in auto-memory-hook.mjs doImport**

In the doImport function (patched by WM-003), after HybridBackend initialization, attempt to create and set the write gate:
```javascript
try {
  const { createMemoryWriteGateHook } = await import('@sparkleideas/claude-flow-guidance/memory-write-gate');
  const gate = createMemoryWriteGateHook({ embeddingProvider: 'agentdb' });
  await gate.initialize();
  const { setWriteGate } = await import(MI_PATH);
  setWriteGate(gate);
} catch { /* guidance package not installed -- no gate, memory still works */ }
```

### Execution order: 610 (after WM-012 at 600)

### Sentinel
```
grep "setWriteGate" memory/memory-initializer.js
grep "_writeGate" memory/memory-initializer.js
```

### Dependencies
- WM-001 (HybridBackend)
- WM-003 (AutoMemoryBridge)
- MemoryWriteGateHook implemented in guidance repo

---

## Phase 2: Trust-Aware Search Ranking (WM-013)

### Defect: WM-013 -- Wire trust scores into search result reranking

**Severity**: High
**GitHub issue**: (to be created)
**Target files**: `memory/memory-initializer.js` (MI), `mcp-tools/memory-tools.js` (MCP_MEMORY)

### Patch Operations

**WM-013a: Add trust state loader to memory-initializer.js**

Export two new helper functions:
```javascript
export function loadTrustState() {
  try {
    const statePath = path.join(process.cwd(), '.claude-flow', 'guidance', 'advanced', 'advanced-state.json');
    if (!fs.existsSync(statePath)) return new Map();
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return new Map((state.trustSnapshots || []).map(s => [s.agentId, s]));
  } catch { return new Map(); }
}

export function getTrustMultiplier(trustScore) {
  if (trustScore >= 0.7) return 1.0;     // Full privilege
  if (trustScore >= 0.4) return 0.8;     // Restricted
  if (trustScore >= 0.2) return 0.6;     // Read-only
  return 0.0;                             // Suspended -- filter out
}
```

**WM-013b: Import trust helpers in memory-tools.js**

Add to the import section:
```javascript
const { loadTrustState, getTrustMultiplier } = await import(MI_PATH);
```

**WM-013c: Rerank search results by trust multiplier**

In the memory_search handler, AFTER result mapping and BEFORE return, insert:
```javascript
// Trust-aware reranking
let trustMap;
try { trustMap = loadTrustState(); } catch { trustMap = new Map(); }
if (trustMap.size > 0) {
  for (const r of results) {
    const authorId = r.author_id || r.agentId || 'unknown';
    const snapshot = trustMap.get(authorId);
    const multiplier = snapshot ? getTrustMultiplier(snapshot.score) : 1.0;
    r._trustMultiplier = multiplier;
    r._adjustedScore = (r.similarity || 0) * multiplier;
  }
  // Filter suspended agents and re-sort
  const filtered = results.filter(r => (r._trustMultiplier ?? 1.0) > 0);
  filtered.sort((a, b) => (b._adjustedScore ?? b.similarity ?? 0) - (a._adjustedScore ?? a.similarity ?? 0));
  // Clean up internal fields
  for (const r of filtered) { delete r._trustMultiplier; delete r._adjustedScore; }
  results.length = 0;
  results.push(...filtered.slice(0, limit));
}
```

**WM-013d: Add trust tier to memory status output**

In `commands/memory.js` (CLI_MEMORY), add trust state summary to the status subcommand output.

### Execution order: 620 (after WM-014 at 610)

### Sentinel
```
grep "loadTrustState" memory/memory-initializer.js
grep "getTrustMultiplier" memory/memory-initializer.js
grep "trustMap" mcp-tools/memory-tools.js
```

### Dependencies
- WM-014 (write gate, establishes trust state reading pattern)
- GuidanceAdvancedRuntime must persist advanced-state.json (already does)

---

## Phase 3: Production Embedding Provider (guidance repo)

Changes in the guidance implementation repo (not patch repo):
- In createMemoryWriteGateHook, auto-detect AgentDB availability and default to 'agentdb' provider
- Update embedding-provider.js factory to check config.json for agentdb.vectorBackend setting
- Falls back to 'hash' only when AgentDB is genuinely unavailable

No patch defect needed -- this is a guidance repo change.

---

## Phase 4: Separate Governance RVF (future)

### Defect: GV-002 -- Create separate governance RVF with witness chain

Deferred to a later phase. Requires:
- New AgentDB backend instance for governance in guidance repo
- Migrate advanced-state.json and proof-chain.json into governance.rvf
- Extend WM-010 session-start verification to cover governance.rvf
- Add new path variable (e.g., GOV_RVF) to lib/common.py

This is a larger effort and depends on the guidance repo having AgentDB as a non-optional dependency.

---

## Test Strategy

### Test Categories

All tests use `node:test` framework (patch repo) or `vitest` (guidance repo).

### Unit Tests (patch repo: tests/)

**New file: `29-write-gate-integration.test.mjs`**

Tests for WM-014 (mandatory write gate):

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Write gate allows valid entry | checkWrite returns allowed=true, storeEntry succeeds |
| 2 | Write gate blocks contradictory entry | checkWrite returns allowed=false, storeEntry returns gated:true |
| 3 | Write gate blocks unauthorized namespace | Authority check fails, store rejected |
| 4 | Write gate blocks rate-limited agent | Rate limit exceeded, store rejected |
| 5 | No gate installed -- writes proceed | _writeGate is null, storeEntry works normally |
| 6 | Gate initialization failure -- graceful degradation | Import fails, no gate set, writes proceed |
| 7 | setWriteGate/getWriteGate round-trip | Set gate, get gate, verify same instance |
| 8 | Gate receives correct entry metadata | key, namespace, value, agentId passed accurately |

**Fixtures needed**: Add mock write gate to tests/fixtures/ that implements checkWrite with configurable allow/deny behavior.

**New file: `30-trust-reranking.test.mjs`**

Tests for WM-013 (trust-aware search):

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Trusted agent (score 0.9) -- multiplier 1.0 | Results unchanged |
| 2 | Restricted agent (score 0.5) -- multiplier 0.8 | Score reduced 20% |
| 3 | Read-only agent (score 0.3) -- multiplier 0.6 | Score reduced 40% |
| 4 | Suspended agent (score 0.1) -- filtered out | Entry removed from results |
| 5 | Unknown agent -- default multiplier 1.0 | No trust state -- pass through |
| 6 | Missing trust state file -- no reranking | Graceful degradation |
| 7 | Corrupt trust state file -- no reranking | JSON parse error handled |
| 8 | Results re-sorted after reranking | Higher trust moves entries up |
| 9 | Limit preserved after filtering | limit=5 still returns 5 after filter |
| 10 | loadTrustState returns correct Map | Reads advanced-state.json accurately |
| 11 | getTrustMultiplier tier boundaries | Test exact boundary values 0.7, 0.4, 0.2 |
| 12 | Mixed trust tiers sorted correctly | [0.9, 0.5, 0.1, 0.8] -- sorted by adjusted score |

**Fixtures needed**:
- Mock advanced-state.json with various trust snapshots
- Pre-populated search results with author_id fields

### Integration Tests (patch repo: tests/)

**New file: `31-memory-governance-integration.test.mjs`**

Tests that exercise both memory and governance systems together:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Store entry through write gate | Create gate, set it, store entry -- gate.checkWrite called |
| 2 | Search with trust file present | Write trust state, search -- results reranked |
| 3 | Store + search round-trip with gate | Store (gated) -- search (trust-ranked) -- verify ordering |
| 4 | Gate blocks -- search has no entry | Gate denies store -- search returns empty |
| 5 | Trust state updates between searches | Change trust state -- re-search -- different ranking |
| 6 | Concurrent store with gate | Multiple stores -- gate rate limit applies |
| 7 | HybridBackend + gate + trust full pipeline | store(gated) -- search(ranked) -- feedback(WM-009) |
| 8 | Gate + AutoMemoryBridge doSync | doSync imports with gate active -- entries gated |

**Fixtures needed**:
- Full HybridBackend fixture with mock gate
- Trust state file generator
- Uses integration-setup.mjs helpers (findNpxNmWithNativeDeps)
- Skip conditions: native deps required (better-sqlite3, agentdb)

### E2E Functional Tests (patch repo: tests/)

**New file: `32-alignment-e2e.test.mjs`**

Full end-to-end tests:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Init project -- gate installed automatically | init --yes -- doImport -- write gate created |
| 2 | Store contradictory entry -- blocked | Store "always use tabs", then store "never use tabs" -- second blocked |
| 3 | Suspended agent search filtering | Create entries by agent A (trusted) and B (suspended) -- search returns only A's |
| 4 | Trust score evolution affects ranking | Agent starts trusted -- violates -- trust drops -- results demoted |
| 5 | Embedding space consistency | Same text -- same vector via both EmbeddingProvider and HybridBackend |
| 6 | Session lifecycle with gate | SessionStart(doImport) -- MCP store(gated) -- MCP search(ranked) -- SessionEnd(doSync) |
| 7 | Graceful degradation without guidance | Uninstall guidance package -- memory still works (no gate, no trust reranking) |
| 8 | Config.json controls gate behavior | Set memory.backend: sqljs -- gate still works (not backend-specific) |

**Skip conditions**: These tests require both native deps AND guidance package installed. Most will skip in CI without full stack.

### Guidance Repo Tests (vitest)

**Updates to existing files:**

1. `memory-write-gate.test.mjs` -- Add tests for mandatory checkWrite behavior in memory_store flow
2. `e2e-memory-agentdb-v3.test.mjs` -- Add trust-aware search verification
3. `e2e-full-pipeline.test.mjs` -- Add write gate in session lifecycle

**New file: `e2e-alignment-integration.test.mjs`**

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | MemoryWriteGateHook blocks contradictory write via CLI subprocess | Run memory_store via npx -- gate blocks |
| 2 | Trust reranking via CLI subprocess | Write trust state -- run memory_search via npx -- verify order |
| 3 | Embedding consistency between EmbeddingProvider and HybridBackend | Compare vector outputs |
| 4 | Full governance + memory session | Init -- install -- start -- store -- search -- verify trust applied |

---

## Fixture Requirements

### Patch Repo Fixtures

New files to add to `tests/fixtures/`:

1. **`tests/fixtures/mock-write-gate.mjs`**
```javascript
export class MockWriteGate {
  constructor(options = {}) {
    this.denyKeys = new Set(options.denyKeys || []);
    this.denyNamespaces = new Set(options.denyNamespaces || []);
    this.calls = [];
  }
  async checkWrite(entry) {
    this.calls.push(entry);
    if (this.denyKeys.has(entry.key)) return { allowed: false, reason: 'key denied' };
    if (this.denyNamespaces.has(entry.namespace)) return { allowed: false, reason: 'namespace denied' };
    return { allowed: true };
  }
  async initialize() {}
  destroy() {}
}
```

2. **`tests/fixtures/trust-state.json`**
```json
{
  "updatedAt": "2026-02-25T00:00:00.000Z",
  "trustSnapshots": [
    { "agentId": "trusted-agent", "score": 0.9, "tier": "trusted" },
    { "agentId": "standard-agent", "score": 0.55, "tier": "standard" },
    { "agentId": "probation-agent", "score": 0.35, "tier": "probation" },
    { "agentId": "suspended-agent", "score": 0.1, "tier": "untrusted" }
  ]
}
```

3. **Update `tests/fixtures/cli/dist/src/memory/memory-initializer.js`**
Add the WM-014 old_string patterns so patch testing works.

4. **Update `tests/fixtures/cli/dist/src/mcp-tools/memory-tools.js`**
Add the WM-013 old_string patterns so patch testing works.

---

## Dependency Chain Update

Current chain (CLAUDE.md):
```
IN-001 -> SG-003
NS-001 -> NS-002 -> NS-003
WM-003 -> WM-004
```

New additions:
```
WM-001 -> WM-014 (write gate needs HybridBackend)
WM-003 -> WM-014 (write gate hooks into doImport)
WM-014 -> WM-013 (trust reranking builds on gate infrastructure)
```

Full chain:
```
WM-001 (350) -> WM-003 (370) -> WM-004 (390)
                              -> WM-014 (610) -> WM-013 (620)
WM-008 (560) -> WM-009 (570/580) -> WM-010 (585) -> WM-011 (590) -> WM-012 (600)
```

---

## Execution Order Summary

| Order | Defect | Phase | What |
|-------|--------|-------|------|
| 610 | WM-014 | 1 | Mandatory write gate |
| 620 | WM-013 | 2 | Trust-aware search ranking |
| (future) | GV-002 | 4 | Separate governance RVF |

---

## Verification Checklist

After implementation:

- [ ] `bash patch-all.sh --global` applies WM-014 and WM-013
- [ ] `bash patch-all.sh --global` is idempotent (0 applied on re-run)
- [ ] `bash check-patches.sh` shows all sentinels OK
- [ ] `npm test` passes (all 29-32 test files)
- [ ] `npm run preflight` regenerates tables correctly
- [ ] Write gate blocks contradictory writes in manual testing
- [ ] Trust reranking changes result order in manual testing
- [ ] Graceful degradation when guidance package is not installed
