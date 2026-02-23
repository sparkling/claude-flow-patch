# DM-004: Worker stubs — preload + consolidation

**Severity**: Enhancement
**GitHub**: [#1139](https://github.com/ruvnet/claude-flow/issues/1139)

Merged from DM-005 ([#1140](https://github.com/ruvnet/claude-flow/issues/1140)).

## Root Cause

Two worker types in `worker-daemon.js` were stubs:

1. **Preload worker**: existed in the switch statement but was missing from
   `DEFAULT_WORKERS` (never scheduled). `runPreloadWorkerLocal()` returned
   `{resourcesPreloaded: 0}` without loading anything. Also missing from
   defaults: ultralearn, deepdive, refactor, benchmark workers.

2. **Consolidation worker** (ex DM-005): wrote
   `{patternsConsolidated: 0}` to a JSON file without performing any
   actual memory consolidation — no temporal decay, no HNSW rebuild.

## Fix

| Op | Change |
|----|--------|
| 1 | Add missing workers (ultralearn, deepdive, refactor, benchmark, preload) to `DEFAULT_WORKERS` |
| 2 | Implement real preload: call `loadEmbeddingModel()` and `getHNSWIndex()` from memory-initializer.js |
| 3 | Implement real consolidation: call `applyTemporalDecay()` to reduce stale pattern confidence, then `clearHNSWIndex()` + `getHNSWIndex({ forceRebuild: true })` to rebuild the index |

## Files Patched

- `services/worker-daemon.js`

## Ops

3 ops in fix.py
