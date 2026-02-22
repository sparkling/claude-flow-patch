# CF-003: Doctor --install native dependency resolution

**Severity**: Medium
**GitHub**: [#1186](https://github.com/ruvnet/claude-flow/issues/1186)

## Root Cause

Error messages from WM-001 (memory wiring) tell users to run
`npx @claude-flow/cli doctor --install`, but `--install` only handles
Claude Code CLI installation. There is no diagnostic for the memory
backend's native dependencies (`better-sqlite3`, `agentdb`,
`@claude-flow/memory`), so users get no help resolving the most
common failure mode: missing or broken `better-sqlite3` native bindings.

The existing `checkMemoryDatabase` (lines 103-122) only checks whether
a `.db` file exists on disk. It does not verify that the configured
memory backend can actually be loaded.

## Fix

Two patch ops:

**CF-003a**: Add a `checkMemoryBackend()` diagnostic function near the
existing `checkMemoryDatabase`. It reads `memory.backend` from
`.claude-flow/config.json` (absorbs CF-005), then tries
`require.resolve()` for `better-sqlite3`, `agentdb`, and
`@claude-flow/memory`. Reports configured backend vs actual package
availability. Flags mismatches with a clear fix suggestion.

**CF-003b**: Extend the `--install` auto-fix path. After the existing
Claude Code CLI install block (lines 508-527), if `checkMemoryBackend`
reported a failure and `autoInstall` is true, locate the `better-sqlite3`
package directory and run `npx node-gyp rebuild` there. Re-check after
rebuild and report success/failure.

## Files Patched

- `commands/doctor.js`

## Ops

4 ops in fix.py (CF-003a, CF-003a2, CF-003a3, CF-003b)
