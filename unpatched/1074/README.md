# 1074: hooks intelligence --status crashes on undefined SONA/MoE metrics

**Severity**: Critical
**GitHub**: [#1074](https://github.com/ruvnet/claude-flow/issues/1074)

## Root Cause

`commands/hooks.js` calls `.toFixed()` on optional metrics (`learningTimeMs`, `adaptationTimeMs`, `avgQuality`, `routingAccuracy`, `loadBalance`, `cacheHitRate`) and assumes `result.performance` always exists.

## Fix

Add null guards with `N/A` fallback for optional numeric values and guard performance rendering when `result.performance` is missing.

## Files Patched

- commands/hooks.js

## Ops

7 ops in fix.py
