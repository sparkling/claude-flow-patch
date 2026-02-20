# HK-004: hooks_session-start ignores daemon.autoStart from settings.json
**Severity**: High
**GitHub**: [#1175](https://github.com/ruvnet/claude-flow/issues/1175)
## Root Cause
`hooks_session-start` handler in `hooks-tools.js` (line ~1216) determines daemon auto-start solely from the MCP call parameter: `const shouldStartDaemon = params.startDaemon !== false;`. It never reads `claudeFlow.daemon.autoStart` from `.claude/settings.json`. Setting `autoStart: false` in settings.json has no effect — the daemon always starts on session-start.
## Fix
Wrap the `shouldStartDaemon` assignment in an IIFE that first checks the MCP parameter, then reads settings.json. If `claudeFlow.daemon.autoStart === false`, returns false. Falls back to true on any read/parse error.
## Files Patched
- mcp-tools/hooks-tools.js
## Ops
1 op in fix.py
