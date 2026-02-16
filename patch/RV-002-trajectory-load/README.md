# RV-002: activeTrajectories not loaded from saved file

**Severity**: High
**GitHub**: TBD

## Root Cause

The `load()` method in the Intelligence class doesn't include `activeTrajectories` in the returned object. When `trajectory-begin` saves an active trajectory, it's written to the file but the next command (`trajectory-step`) creates a new Intelligence instance that doesn't load `activeTrajectories` from the file.

```javascript
// Current broken code (line 2721-2750)
load() {
  const defaults = { patterns: {}, memories: [], trajectories: [], ... };
  try {
    if (fs.existsSync(this.intelPath)) {
      const data = JSON.parse(fs.readFileSync(this.intelPath, 'utf-8'));
      return {
        patterns: data.patterns || defaults.patterns,
        memories: data.memories || defaults.memories,
        trajectories: data.trajectories || defaults.trajectories,
        // ... other fields
        // NOTE: activeTrajectories is NOT being loaded!
      };
    }
  } catch {}
  return defaults;
}
```

This causes `trajectory-step` and `trajectory-end` to fail with "No active trajectory" error.

## Fix

Add `activeTrajectories` to both the defaults and the returned object in the `load()` method.

## Files Patched

- `node_modules/ruvector/bin/cli.js`

## Ops

2 ops in fix.py
