# RV-003: trajectory-end does not update stats counters

**Severity**: Medium
**GitHub**: [ruv-FANN#186](https://github.com/ruvnet/ruv-FANN/issues/186)

## Root Cause

The `hooks trajectory-end` command pushes completed trajectories to
`data.trajectories[]` and calls `intel.save()`, but never syncs the
`data.stats.total_trajectories` counter. The `hooks stats` command reads
the stale counter and reports 0 trajectories even when the array has entries.

Compare with `learn()` which correctly does:
```javascript
this.data.stats.total_trajectories = this.data.trajectories.length;
```

## Fix

Add stats counter sync before `intel.save()` in the `trajectory-end` handler:
- `total_trajectories` from `trajectories.length`
- `total_patterns` from `Object.keys(patterns).length`
- `total_memories` from `memories.length`

## Files Patched

- `bin/cli.js` (ruvector)

## Ops

1 op in fix.py
