# 1008: memory stats fails when `memory_stats` MCP tool is unavailable

**Severity**: Medium
**GitHub**: [#1008](https://github.com/ruvnet/claude-flow/issues/1008)

## Root Cause

`commands/memory.js` hard-fails in `stats` when `callMCPTool('memory_stats', {})` is missing or unavailable, even though related memory tools can still operate.

## Fix

Add a bounded fallback path in `memory stats`:
- Try `memory_stats` first.
- If unavailable, call `memory_list` and synthesize minimal stats output.

This keeps the command functional without changing storage semantics.

## Files Patched

- commands/memory.js

## Verification

- `npx @claude-flow/cli@latest memory stats`
- Simulate missing `memory_stats` and verify fallback still returns a stats table/json.

## Ops

1 op in fix.py
