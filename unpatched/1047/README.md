# 1047: statusline ADR count is hardcoded to 0/0

**Severity**: Medium
**GitHub**: [#1047](https://github.com/ruvnet/claude-flow/issues/1047)

## Root Cause

`hooks statusline` in `commands/hooks.js` renders `ADRs ●0/0` as a hardcoded string and does not compute ADR totals from project files.

## Fix

Add ADR discovery/counting logic in `statusline` generation, include ADR stats in JSON output, and replace the hardcoded `0/0` with dynamic values.

## Files Patched

- commands/hooks.js

## Ops

3 ops in fix.py
