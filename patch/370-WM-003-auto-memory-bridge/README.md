# WM-003: Activate AutoMemoryBridge in auto-memory-hook.mjs

**Severity**: High
**GitHub**: [#1102](https://github.com/ruvnet/claude-flow/issues/1102)

## Root Cause

The `generateAutoMemoryHook()` function in `helpers-generator.js` emits an
`auto-memory-hook.mjs` file with three stub functions (`doImport()`, `doSync()`,
`doStatus()`) that detect `@claude-flow/memory` but never actually use it. The stubs
print "run init --upgrade for full support" and return early. Because the hook is
the only entry point for session-start import and session-end sync of Claude Code's
auto memory (`.claude/memory/`), no auto-memory data ever flows into the
HybridBackend wired by WM-001.

## Fix

Replace the three stub functions inside the template literal returned by
`generateAutoMemoryHook()`:

| Op | What it does |
|----|-------------|
| WM-003a | Replace `doImport()` stub with full AutoMemoryBridge import flow: instantiate HybridBackend, create bridge with `syncMode: 'on-session-end'`, call `bridge.importFromAutoMemory()` |
| WM-003b | Replace `doSync()` stub with full sync flow: instantiate backend, call `bridge.syncToAutoMemory()`, report entries synced |
| WM-003c | Replace `doStatus()` stub with real bridge status: show backend type, entry count, last sync time, package availability |

All injected code lives inside the template literal (backtick string), so `${...}`
expressions must be escaped as `\${...}` in the JS output (and `\\$\{...\}` in the
Python fix.py source).

## Files Patched

- `init/helpers-generator.js`

## Ops

3 ops in fix.py
