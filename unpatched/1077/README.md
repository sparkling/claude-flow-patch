# 1077: macOS daemon worker scheduling blocked by freemem threshold

**Severity**: Critical (macOS only)
**GitHub**: [#1077](https://github.com/ruvnet/claude-flow/issues/1077)

## Root Cause

`worker-daemon.js` uses `os.freemem()` percentage gate directly. On macOS this under-reports reclaimable memory, so workers can be blocked permanently by `minFreeMemoryPercent`.

## Fix

Skip the free-memory threshold check on macOS (`darwin`) and keep existing threshold behavior on other platforms.

## Files Patched

- services/worker-daemon.js

## Ops

1 op in fix.py
