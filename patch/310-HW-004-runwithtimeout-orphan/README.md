# HW-004: runWithTimeout rejects but does not kill child process
**Severity**: Medium
**GitHub**: [#1117](https://github.com/ruvnet/claude-flow/issues/1117)
## Root Cause
`runWithTimeout()` in `worker-daemon.js` has `DEFAULT_WORKER_TIMEOUT_MS = 5 * 60 * 1000` (5 min), but the headless executor's per-worker timeouts range from 5-15 minutes. When the daemon timeout fires first, the promise rejects but the underlying `claude --print` child process keeps running as an orphan until the executor's own timeout fires minutes later.
## Fix
Raise `DEFAULT_WORKER_TIMEOUT_MS` from 5 minutes to 16 minutes so the daemon timeout never fires before the executor's own per-worker timeout (max 15 min for audit/refactor workers). The executor handles its own child process cleanup on timeout.
## Files Patched
- services/worker-daemon.js
## Ops
1 op in fix.py
