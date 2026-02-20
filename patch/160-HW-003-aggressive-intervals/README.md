# HW-003: Worker scheduling intervals too aggressive + settings ignored
**Severity**: High
**GitHub**: [#1113](https://github.com/ruvnet/claude-flow/issues/1113)
## Root Cause
`DEFAULT_WORKERS` uses pre-headless intervals (audit: 10m, optimize: 15m, testgaps: 20m). ADR-020 specifies longer intervals (30/60/60m) for headless workers that invoke Claude. Additionally, `daemon.schedules` from `.claude/settings.json` is never read — user-configured intervals are completely ignored.
## Fix
(A) Align hardcoded intervals to ADR-020: audit 30m, optimize 60m, testgaps 60m. (B) After setting default workers, read `claudeFlow.daemon.schedules` from `.claude/settings.json` and merge user-configured intervals/enabled flags into matching workers. Supports string formats ("1h", "30m", "10s") and raw milliseconds.
## Files Patched
- services/worker-daemon.js
## Ops
4 ops in fix.py
