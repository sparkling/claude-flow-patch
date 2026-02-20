# DM-006: No log rotation — logs grow unbounded
**Severity**: Medium
**GitHub**: [#1114](https://github.com/ruvnet/claude-flow/issues/1114)
## Root Cause
(Headless) `logExecution()` in `headless-worker-executor.js` creates 2-3 log files per worker run (~75 KB each) but has zero cleanup. No rotation, no max file count, no TTL. At current daemon intervals this accumulates ~23 MB/day, ~702 MB/month. (Main) `startBackgroundDaemon()` in `daemon.js` opens `daemon.log` in append mode and never truncates. A single long-running daemon can grow daemon.log to 100+ GB.
## Fix
(A) Add `unlinkSync` and `statSync` to the headless executor ESM import. (B) Call `cleanupOldLogs()` from `ensureLogDir()` so cleanup runs on each headless execution cycle. (C) Add `cleanupOldLogs()` method: removes `.log` files older than 7 days or beyond a 500-file cap, keeping newest files. (D) In `daemon.js`, before opening `daemon.log` for append, check its size with `fs.statSync()` and rotate to `daemon.log.1` if > 50MB.
## Files Patched
- services/headless-worker-executor.js
- commands/daemon.js
## Ops
4 ops in fix.py
