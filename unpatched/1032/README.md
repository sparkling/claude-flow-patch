# 1032: memory_store crashes on undefined/null value

**Severity**: High
**GitHub**: [#1032](https://github.com/ruvnet/claude-flow/issues/1032)

## Root Cause

`memory_store` forwards `undefined` value into storage/embedding paths. `JSON.stringify(undefined)` yields `undefined`, and later embedding generation checks `value.length`, causing runtime errors.

## Fix

Validate `input.value` in `memory_store` before processing, return structured error for missing value, and guard embedding generation with a strict string check in `storeEntry`.

## Files Patched

- mcp-tools/memory-tools.js
- memory/memory-initializer.js

## Ops

2 ops in fix.py
