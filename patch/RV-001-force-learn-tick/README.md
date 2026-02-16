# RV-001: force-learn command calls intel.tick() which doesn't exist

**Severity**: Medium
**GitHub**: [#1156](https://github.com/ruvnet/claude-flow/issues/1156)

## Root Cause

The `hooks force-learn` command (line 4224) creates an Intelligence instance with
`skipEngine: true` (fast mode), then calls `intel.tick()`. The `tick()` method
exists on the engine object (`eng.tick()`), not on the Intelligence class itself.
With `skipEngine: true`, no engine is created, so the call crashes.

```javascript
// Line 4224-4226
const intel = new Intelligence({ skipEngine: true });  // Fast mode
intel.tick();  // BUG: tick() doesn't exist on Intelligence
```

## Fix

1. Remove `skipEngine: true` so the engine can initialize
2. Call `intel.engine.tick()` instead of `intel.tick()`
3. Add null check for when engine fails to load

## Files Patched

- `ruvector/bin/cli.js`

## Ops

2 ops in fix.py
