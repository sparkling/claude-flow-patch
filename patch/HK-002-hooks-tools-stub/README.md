# HK-002: MCP hook handlers are stubs that don't persist data

**Severity**: High
**GitHub**: [#1058](https://github.com/ruvnet/claude-flow/issues/1058)

## Root Cause

Three MCP hook handlers in `hooks-tools.js` return success responses but **never persist any data**:

1. **`hooksPostEdit`** (line 512) -- Returns `{recorded: true}` but has no database INSERT
2. **`hooksPostCommand`** (line 568) -- Same, claims recorded but stores nothing
3. **`hooksPostTask`** (line 886) -- Returns fake random duration and hardcoded pattern counts

The store function `getRealStoreFunction()` (line 23) already exists in the file and is used correctly by other handlers (`hooks_intelligence_trajectory-end`, `hooks_intelligence_pattern-store`). These three just never call it.

## Fix

Patch each handler to call `getRealStoreFunction()` and persist to appropriate namespaces:
- `hooksPostEdit` -> namespace: `edits`
- `hooksPostCommand` -> namespace: `commands`
- `hooksPostTask` -> namespace: `tasks`

## Impact Without Patch

- Edit patterns never stored -- can't learn from file edits
- Command history lost -- can't learn from command outcomes
- Task outcomes not tracked -- SONA learning has no data
- Misleading metrics -- statusline shows fake pattern counts

## Files Patched

- `mcp-tools/hooks-tools.js`

## Ops

3 ops in fix.py
