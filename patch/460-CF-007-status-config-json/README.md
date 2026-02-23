# CF-007: status.js isInitialized checks config.yaml instead of config.json

**Severity**: Medium
**GitHub**: [#1198](https://github.com/ruvnet/claude-flow/issues/1198)

## Root Cause

`commands/status.js` `isInitialized()` at line 37 checks only for `config.yaml`:

```js
function isInitialized(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return fs.existsSync(configPath);
}
```

After SG-008, init generates `config.json`. Projects initialized with the patched version won't have `config.yaml`, causing `status` to report "not initialized".

## Fix

Replace `isInitialized()` to check for `config.json` first, with `config.yaml` fallback for migration.

## Files Patched

- `commands/status.js`

## Ops

1 op in fix.py
