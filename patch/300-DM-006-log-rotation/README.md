# DM-006: No log rotation — headless execution logs grow unbounded
**Severity**: Medium
**GitHub**: [#1114](https://github.com/ruvnet/claude-flow/issues/1114)
## Root Cause
`logExecution()` in `headless-worker-executor.js` creates 2-3 log files per worker run (~75 KB each) but has zero cleanup. No rotation, no max file count, no TTL. At current daemon intervals this accumulates ~23 MB/day, ~702 MB/month.
## Fix
(A) Add `unlinkSync` and `statSync` to the ESM import. (B) Call `cleanupOldLogs()` from `ensureLogDir()` so cleanup runs on each execution cycle. (C) Add `cleanupOldLogs()` method: removes `.log` files older than 7 days or beyond a 500-file cap, keeping newest files.
## Files Patched
- services/headless-worker-executor.js
## Ops
3 ops in fix.py
