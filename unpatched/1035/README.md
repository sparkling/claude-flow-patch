# 1035: hive-mind task command calls non-existent MCP tool

**Severity**: High
**GitHub**: [#1035](https://github.com/ruvnet/claude-flow/issues/1035)

## Root Cause

`commands/hive-mind.js` calls `hive-mind_task`, but the MCP registry has no tool with that name. Task submission fails immediately with `MCP tool not found`.

## Fix

Use `task_create` as the backend for hive-mind task submission and make the output rendering tolerant of the fallback response shape.

## Files Patched

- commands/hive-mind.js

## Ops

2 ops in fix.py
