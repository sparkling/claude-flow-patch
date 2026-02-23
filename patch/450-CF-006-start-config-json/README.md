# CF-006: start.js uses hand-rolled YAML parser instead of config.json

**Severity**: Medium
**GitHub**: [#1197](https://github.com/ruvnet/claude-flow/issues/1197)

## Root Cause

`commands/start.js` contains three functions that read `config.yaml`:
1. `isInitialized()` — checks for `config.yaml` existence only
2. `parseSimpleYaml()` — a 50-line hand-rolled YAML parser
3. `loadConfig()` — reads and parses `config.yaml`

After config.json consolidation (SG-008), the canonical config is `.claude-flow/config.json`. Projects initialized with the patched version generate config.json, so `isInitialized()` returns false and `loadConfig()` returns null.

## Fix

Replace all three functions:
- `isInitialized()`: check for `config.json` first, with `config.yaml` fallback
- Delete `parseSimpleYaml()` entirely (replaced by `JSON.parse`)
- `loadConfig()`: read `config.json` with `JSON.parse`, fall back to `config.yaml`

## Files Patched

- `commands/start.js`

## Ops

1 op in fix.py
