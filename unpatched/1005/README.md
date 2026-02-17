# 1005: memory store crashes when --value is numeric

**Severity**: High
**GitHub**: [#1005](https://github.com/ruvnet/claude-flow/issues/1005)

## Root Cause

`commands/memory.js` reads `ctx.flags.value` and passes it directly to `Buffer.byteLength(value, 'utf8')`.
For numeric-looking values (for example `--value 25`), the parsed value can be a number, which throws at runtime.

## Fix

Normalize the value to a string before size calculation and storage. Keep empty-value validation strict (`undefined`/`null`/empty string) so numeric values like `0` are accepted.

## Files Patched

- commands/memory.js

## Ops

3 ops in fix.py
