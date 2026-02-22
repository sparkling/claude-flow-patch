# WM-004: Source hook silently falls back to JsonFileBackend

**Severity**: High
**GitHub**: [#1190](https://github.com/ruvnet/claude-flow/issues/1190)

## Root Cause

The source `auto-memory-hook.mjs` (shipped with `@claude-flow/cli`, copied to projects during `init`) wraps `new HybridBackend(...)` in a silent try/catch that substitutes `JsonFileBackend` on any failure:

```javascript
try {
    backend = new memPkg.HybridBackend({...});
} catch {
    backend = new JsonFileBackend(STORE_PATH);
}
```

When `backend` is configured as `hybrid` but native deps are missing, the user silently gets a degraded JSON backend with no feedback.

## Fix

Replace the silent fallback with a `readConfig()` that reads `.claude-flow/config.json` and a `createBackend()` helper that fails loud when a non-JSON backend is unavailable:
- `readConfig()` reads `backend` from config.json (YAML fallback for migration)
- `createBackend()` returns `JsonFileBackend` when `backend=json`, otherwise requires `HybridBackend` and throws actionable errors on failure
- `doImport()` and `doSync()` use `createBackend()` instead of the inline try/catch

## Files Patched

- `.claude/helpers/auto-memory-hook.mjs` (source hook shipped with package)

## Ops

3 ops in fix.py
