# RV-001: force-learn command calls intel.tick() which doesn't exist

**Severity**: Medium
**GitHub**: TBD

## Root Cause

The `hooks force-learn` command creates an Intelligence instance with `skipEngine: true` (fast mode), then calls `intel.tick()`. However, the `tick()` method exists on the engine object (`eng.tick()`), not on the Intelligence class itself.

```javascript
// Current broken code (line 4221-4226)
hooksCmd.command('force-learn')
  .description('Force an immediate learning cycle')
  .action(() => {
    const intel = new Intelligence({ skipEngine: true });  // Fast mode
    intel.tick();  // ← BUG: tick() doesn't exist on Intelligence
    console.log(JSON.stringify({ success: true, result: 'Learning cycle triggered', stats: intel.stats() }));
  });
```

## Fix

1. Remove `skipEngine: true` so engine can be initialized
2. Call `intel.engine.tick()` instead of `intel.tick()`
3. Add null check for when engine fails to load

## Files Patched

- `node_modules/ruvector/bin/cli.js`

## Ops

2 ops in fix.py
