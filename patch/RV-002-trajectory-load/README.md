# RV-002: activeTrajectories not loaded from saved file

**Severity**: High
**GitHub**: [#1157](https://github.com/ruvnet/claude-flow/issues/1157)

## Root Cause

The `load()` method in the Intelligence class (line ~2721) doesn't include
`activeTrajectories` in the returned object. When `trajectory-begin` saves an
active trajectory, it's written to the file, but the next command
(`trajectory-step`) creates a new Intelligence instance that doesn't load
`activeTrajectories` back from the file.

This causes `trajectory-step` and `trajectory-end` to fail with
"No active trajectory" error.

## Fix

1. Add `activeTrajectories: {}` to the defaults object
2. Add `activeTrajectories: data.activeTrajectories || {}` to the loaded data return

## Files Patched

- `ruvector/bin/cli.js`

## Ops

2 ops in fix.py
