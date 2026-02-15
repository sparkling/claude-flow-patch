# SG-001: Init generates invalid settings

**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)
**Commit**: [`94c32ea`](https://github.com/ruvnet/claude-flow/commits/94c32eadb6aa72901703a6b2fd8b695795c925b3)

## Problem

Invalid hook events (`TeammateIdle`, `TaskCompleted`) and permission patterns (`*` vs `:*`).

## Fix

Remove invalid hooks, add SubagentStop, fix permissions.

## Files

- `init/settings-generator.js`
