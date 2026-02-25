# WM-012: HybridBackend proxy methods for learning + witness chain

**Severity**: High
**GitHub**: [#1212](https://github.com/ruvnet/claude-flow/issues/1212)

## Root Cause

The `HybridBackend` class in `@claude-flow/memory/dist/hybrid-backend.js` wraps both a SQLite backend and an AgentDB backend. While it delegates standard CRUD operations (store, get, search, delete), it doesn't expose the three methods that AgentDB v3 adds for self-learning and tamper detection:

- `recordFeedback(queryId, quality)` -- for the learning loop (WM-009)
- `verifyWitnessChain()` -- for SHAKE-256 data mutation chain verification (WM-010)
- `getWitnessChain()` -- for retrieving the current witness chain state

Without these proxies, callers must reach through `getAgentDBBackend()` to access learning/witness features, breaking the abstraction boundary and requiring knowledge of the internal two-layer architecture.

## Fix

| Op | Target | Change |
|----|--------|--------|
| WM-012a | `hybrid-backend.js` | Add `recordFeedback()` proxy that delegates to `this.agentdb.recordFeedback()` with graceful fallback |
| WM-012b | `hybrid-backend.js` | Add `verifyWitnessChain()` and `getWitnessChain()` proxies with graceful fallbacks |

WM-012b is a dependent patch op -- it uses WM-012a's inserted text as its old_string. Order within fix.py guarantees correct application.

## Files Patched

- `@claude-flow/memory/dist/hybrid-backend.js`

## Ops

2 ops in fix.py
