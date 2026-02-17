# 1055: hooks pre-task requires --task-id (should be optional)

**Severity**: Medium
**GitHub**: [#1055](https://github.com/ruvnet/claude-flow/issues/1055)

## Root Cause

`commands/hooks.js` marks `--task-id` as required and hard-fails when omitted, despite expected UX allowing pre-task registration with only description.

## Fix

Make `--task-id` optional and auto-generate `task-<timestamp>` when absent. Keep description required.

## Files Patched

- commands/hooks.js

## Ops

3 ops in fix.py
