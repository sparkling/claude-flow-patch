# 984: status shows STOPPED when task_summary tool is missing

**Severity**: High
**GitHub**: [#984](https://github.com/ruvnet/claude-flow/issues/984)

## Root Cause

`status` calls `task_summary`, which is absent in affected builds. The thrown error bubbles to the top-level catch in `getSystemStatus()`, forcing a full `running: false` status even when daemon/swarm services are healthy.

## Fix

Add resilient task status retrieval in `status`:
- Try `task_summary`
- Fallback to `task_list` and derive aggregate counters
- If both fail, keep zeroed task counters without failing the entire status response

## Files Patched

- commands/status.js

## Ops

1 op in fix.py
