# 1036: CLI uses non-existent MCP tools for task assignment/submit

**Severity**: High
**GitHub**: [#1036](https://github.com/ruvnet/claude-flow/issues/1036)

## Root Cause

`task assign` calls `task_assign` and `hive-mind task` calls `hive-mind_task`, but these MCP tools are not present in the tool registry. Commands fail with `MCP tool not found`.

## Fix

Rewire CLI command handlers to existing MCP tools:
- `task assign` -> `task_update` with `assignTo`
- `hive-mind task` -> `task_create` with `type: 'hive-task'`

Also harden hive-mind task output formatting for missing optional fields.

## Files Patched

- commands/task.js
- commands/hive-mind.js

## Ops

4 ops in fix.py
