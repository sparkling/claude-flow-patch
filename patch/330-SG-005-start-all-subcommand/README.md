# SG-005: add 'start all' subcommand to start everything at once

**Severity**: Enhancement
**GitHub**: [#1177](https://github.com/ruvnet/claude-flow/issues/1177)

## Root Cause

There is no single command to start the full Claude Flow stack (memory +
daemon + swarm + MCP) on an already-initialized project. `claude-flow start`
only initializes the swarm and MCP server. Users must run `memory init`,
`daemon start`, and `start` separately, or re-run `init --start-all` which
also re-creates project files.

## Fix

Add an `allCommand` subcommand to the `start` command so that
`claude-flow start all` initializes memory, starts the daemon, then runs the
normal `startAction` (swarm + MCP + health checks).

Also adds the subcommand to the `subcommands` array and a corresponding
example entry.

## Files Patched

- `commands/start.js`

## Ops

2 ops in fix.py
