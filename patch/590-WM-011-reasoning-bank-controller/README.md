# WM-011: Instantiate ReasoningBank controller

**Severity**: High
**GitHub**: [#1210](https://github.com/ruvnet/claude-flow/issues/1210)

## Root Cause

`memory-initializer.js` creates HybridBackend + AgentDB v3 but never instantiates `ReasoningBank` from `@claude-flow/neural`. The `hooks_intelligence_pattern-store` and `hooks_intelligence_pattern-search` MCP tools use generic `storeEntry`/`searchEntries` which lack the ReasoningBank's 4-step learning pipeline (retrieve, judge, distill, consolidate), MMR-diverse retrieval, deduplication, and contradiction detection.

As a result:
- Patterns stored as plain key-value entries instead of trajectory-backed patterns
- Pattern search uses generic SQLite/keyword search instead of MMR-diverse vector retrieval
- Consolidation pipeline never runs (dedup, contradiction detection, pruning)
- Pattern evolution tracking and quality history are lost

## Fix

| Op | Target | Change |
|----|--------|--------|
| WM-011a | `memory/memory-initializer.js` | After HybridBackend init, import `ReasoningBank` from `@claude-flow/neural` and create+initialize an instance sharing the AgentDB RVF path |
| WM-011a2 | `memory/memory-initializer.js` | Add `_reasoningBank` module-level variable declaration |
| WM-011a3 | `memory/memory-initializer.js` | Export `getReasoningBank()` getter function |
| WM-011b | `mcp-tools/hooks-tools.js` | Add `getReasoningBankInstance()` lazy loader |
| WM-011c | `mcp-tools/hooks-tools.js` | Replace `hooksPatternStore` handler to use ReasoningBank trajectory distillation with fallback |
| WM-011d | `mcp-tools/hooks-tools.js` | Replace `hooksPatternSearch` handler to use ReasoningBank MMR-diverse retrieval with fallback |

## Files Patched

- `memory/memory-initializer.js`
- `mcp-tools/hooks-tools.js`

## Ops

6 ops in fix.py
