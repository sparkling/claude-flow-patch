# CF-004: config get/export uses hand-rolled YAML parser instead of config.json

**Severity**: Medium
**GitHub**: [#1193](https://github.com/ruvnet/claude-flow/issues/1193)

## Root Cause

`readYamlConfig()` in `config.js` implements a 30-line hand-rolled YAML parser that handles sections via indentation detection. It disagrees with the regex-based parsers in WM-001 and CF-003 on values containing colons, quoted strings, and multi-line values. Additionally, the TypeScript bundler emits this function twice with duplicate import statements, causing a `SyntaxError` if the first copy is replaced without removing the second.

## Fix

| Op | Description |
|----|-------------|
| CF-004a | Replace first `readYamlConfig()` with JSON reader (config.json primary, config.yaml fallback) |
| CF-004b | Remove duplicate `readYamlConfig()` + its import statements (bundler artifact) |

## Files Patched

- `commands/config.js`

## Ops

2 ops in fix.py
