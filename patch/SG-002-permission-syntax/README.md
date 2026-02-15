# SG-002: Settings generator outputs invalid permission patterns

**Severity**: Medium
**GitHub**: [#773](https://github.com/ruvnet/claude-flow/issues/773)

## Root Cause

Settings generator uses `*` for glob patterns but Claude Code requires `:*` for prefix matching.

## Error

```
"Bash(npx @claude-flow*)": Use ":*" for prefix matching, not just "*".
Change to "Bash(npx @claude-flow:*)" for prefix matching.
```

## Fix

Replace wildcard patterns with correct `:*` syntax.

## Files Patched

- `init/settings-generator.js`

## Ops

2 ops in fix.py
