# HK-005: Multiple MCP servers start independent in-process daemons
**Severity**: Critical
**GitHub**: [#1171](https://github.com/ruvnet/claude-flow/issues/1171)
## Root Cause
`hooks_session-start` calls `startDaemon()` (worker-daemon.js) which creates an in-process `WorkerDaemon` singleton per Node.js process. Each MCP server is a separate process with its own singleton — no cross-process coordination. The CLI background daemon path (`daemon.js`) has PID-file coordination but the MCP hook path bypasses it entirely. Result: N MCP servers per project = N daemon instances = N × 6 workers.
## Fix
Add PID-file guard to the MCP hook path using `.claude-flow/daemon.pid` (same file the CLI path uses). Before calling `startDaemon()`, check PID file: if a different process owns it and is alive, skip (reuse). If the PID is our own process or stale, proceed and overwrite. No cleanup on session-end — stale PIDs self-heal via `kill(pid, 0)` on next start. The PID file becomes a universal one-daemon-per-project lock across both MCP and CLI paths.
## Files Patched
- mcp-tools/hooks-tools.js
## Ops
2 ops in fix.py
