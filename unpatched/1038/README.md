# 1038: hooks list renders all hooks as disabled due to shape mismatch

**Severity**: Medium
**GitHub**: [#1038](https://github.com/ruvnet/claude-flow/issues/1038)

## Root Cause

`commands/hooks.js` expects `enabled`, `executionCount`, `lastExecuted`, and `priority` fields from `hooks_list`. MCP responses may only provide `status` and basic fields, so the table renders `Enabled: No` and blank execution data.

## Fix

Normalize hook rows before rendering:
- Derive `enabled` from `status === 'active'` when `enabled` is missing.
- Default `executionCount` to `0`.
- Default `lastExecuted` to `null`.
- Default `priority` to an empty string.

## Files Patched

- commands/hooks.js

## Verification

- `npx @claude-flow/cli@latest hooks list`
- Confirm hooks with `status: active` display as enabled and have non-empty defaults for execution columns.

## Ops

1 op in fix.py
