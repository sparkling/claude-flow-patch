# CF-004: config get/export uses hand-rolled YAML parser instead of config.json

**Severity**: Medium
**GitHub**: [#1193](https://github.com/ruvnet/claude-flow/issues/1193)

## Root Cause

The upstream bundler removed the `readYamlConfig()` function definitions from `config.js`
but CF-002 (order 020) added call-sites that depend on it. Without the definition,
`config get` and `config export` crash with `readYamlConfig is not defined`.

## Fix

| Op | Description |
|----|-------------|
| CF-004a | Inject `readYamlConfig()` function + `fs`/`path` imports (reads config.json primary, config.yaml fallback) |

## Files Patched

- `commands/config.js`

## Ops

1 op in fix.py
