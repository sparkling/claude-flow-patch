# CF-006: config.yaml -> config.json migration in start.js, status.js, init.js

**Severity**: Medium
**GitHub**: [#1197](https://github.com/ruvnet/claude-flow/issues/1197)

Merged from CF-007 ([#1198](https://github.com/ruvnet/claude-flow/issues/1198))
and CF-008 ([#1199](https://github.com/ruvnet/claude-flow/issues/1199)).

## Root Cause

Three command files still read `config.yaml` instead of `config.json`:

1. **`commands/start.js`** (ex CF-006): Contains `isInitialized()`, a 50-line
   `parseSimpleYaml()`, and `loadConfig()` — all reading `config.yaml`.
2. **`commands/status.js`** (ex CF-007): `isInitialized()` checks only
   `config.yaml`, so `status` reports "not initialized" for json-only projects.
3. **`commands/init.js`** (ex CF-008): `isInitialized()` checks `config.yaml`,
   and 5 display strings show the wrong filename.

After SG-008, init generates `config.json`. Projects initialized with the
patched version won't have `config.yaml`, causing all three commands to
malfunction.

## Fix

| Op | File | Change |
|----|------|--------|
| CF-006a | `commands/start.js` | Replace `isInitialized()` + `parseSimpleYaml()` + `loadConfig()` with config.json readers |
| CF-007a | `commands/status.js` | Replace `isInitialized()` to check `config.json` |
| CF-008a | `commands/init.js` | Replace all `.claude-flow/config.yaml` display strings with `config.json` |
| CF-008b | `commands/init.js` | Replace `isInitialized()` to check `config.json` |
| CF-008c | `commands/init.js` | Replace `config.yaml` in JSON output path |

## Files Patched

- `commands/start.js`
- `commands/status.js`
- `commands/init.js`

## Ops

5 ops in fix.py
