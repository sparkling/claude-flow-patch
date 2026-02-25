# WM-009: Wire AgentDB learning loop (recordFeedback)

**Severity**: High
**GitHub**: [#1209](https://github.com/ruvnet/claude-flow/issues/1209)

## Root Cause

WM-008 upgraded AgentDB v2 to v3 and exposed `recordFeedback(queryId, quality)` on the
agentdb-backend, but no MCP handler or CLI command ever calls it. The self-learning
feedback loop is wired at the backend level but dead from the user-facing layer.

`memory-tools.js` MCP handlers (`memory_search`, `memory_retrieve`) never track which
search results the agent subsequently retrieves. Without this implicit signal, the
`SelfLearningRvfBackend` cannot learn which results were useful.

## Fix

| Op | Target | Change |
|----|--------|--------|
| A | `memory/memory-initializer.js` | Export `recordSearchFeedback(entryId, quality)` that delegates to `_hybridBackend.recordFeedback()` |
| B | `mcp-tools/memory-tools.js` | Add module-level `_recentSearchHits` Map; import `recordSearchFeedback` |
| C | `mcp-tools/memory-tools.js` | Populate `_recentSearchHits` after `memory_search` returns results |
| D | `mcp-tools/memory-tools.js` | In `memory_retrieve`, call `recordSearchFeedback` when retrieved key was a recent search hit |
| E | `mcp-tools/memory-tools.js` | (R3) Track `_trajectoryId` from learning backend instead of plain entry ID |
| F | `mcp-tools/memory-tools.js` | (R6) Add `_SEARCH_HITS_MAX = 500` constant |
| G | `mcp-tools/memory-tools.js` | (R6) LRU eviction when `_recentSearchHits` exceeds cap |

**Implicit feedback signal**: When an agent searches, then retrieves a specific result,
the retrieval is implicit positive feedback (quality = 1.0). The Map tracks
`namespace:key` -> trajectory/entry ID from the most recent search, enabling the feedback call.

**Trajectory tracking (R3)**: After WM-008q routes searches through
`SelfLearningRvfBackend.searchAsync()`, results carry `_trajectoryId` (format `q_N`).
Op E stores this trajectory ID instead of the plain entry UUID so that
`recordFeedback()` can associate the signal with the correct learning trajectory.

**LRU cap (R6)**: Ops F and G prevent unbounded growth of `_recentSearchHits` by
evicting the oldest entry (FIFO via Map insertion order) when size exceeds 500.

## Files Patched

- `memory/memory-initializer.js`
- `mcp-tools/memory-tools.js`

## Ops

7 ops in fix.py
