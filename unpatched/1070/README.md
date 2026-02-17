# 1070: MCP stdio emits non-handshake output before initialize

**Severity**: Critical
**GitHub**: [#1070](https://github.com/ruvnet/claude-flow/issues/1070)

## Root Cause

The stdio MCP server emits a `server.initialized` notification to stdout immediately on startup, before the client sends `initialize`. It also logs a raw metadata JSON object, which can be misinterpreted by strict wrappers that parse merged streams.

## Fix

Stop emitting pre-handshake protocol output on stdout. Keep startup diagnostics on stderr, but change raw JSON metadata logging to a plain text line to avoid non-JSON-RPC JSON payload leakage.

## Files Patched

- mcp-server.js

## Ops

2 ops in fix.py
