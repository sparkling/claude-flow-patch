# WM-010: Wire witness chain verification at session start

**Severity**: High
**GitHub**: [#1208](https://github.com/ruvnet/claude-flow/issues/1208)

## Root Cause

WM-008 exposed `verifyWitnessChain()` and `getWitnessChain()` methods on the
AgentDB backend, but no code in the session lifecycle actually calls them. The
witness chain hash is captured at init time (WM-008d) but never verified during
`doImport()`, so tampered memory databases go undetected at session start.

## Fix

Patch `doImport()` in both the helpers-generator template and the source hook
to call `backend.verifyWitnessChain()` after `backend.initialize()`. The
verification is wrapped in try/catch so it is non-fatal -- if the backend
doesn't support witness chains (e.g. JSON backend or AgentDB v2), it silently
skips.

| Op | Target | Change |
|----|--------|--------|
| WM-010a | `init/helpers-generator.js` | After `await backend.initialize()` + busy_timeout in doImport template, add witness chain verification |
| WM-010b | `.claude/helpers/auto-memory-hook.mjs` | After `await backend.initialize()` + busy_timeout in doImport, add witness chain verification |

## Files Patched

- `init/helpers-generator.js`
- `.claude/helpers/auto-memory-hook.mjs` (source hook)

## Ops

2 ops in fix.py
