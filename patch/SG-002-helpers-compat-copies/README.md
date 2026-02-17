# SG-002: Init doesn't create .js/.cjs compat copies for helper modules

**Severity**: High
**GitHub**: [#1153](https://github.com/ruvnet/claude-flow/issues/1153)

## Root Cause

`writeHelpers()` produces either `.cjs` (when copying from source) or `.js` (when generating fallback templates) but never both extensions. `writeStatusline()` produces `statusline.cjs` but no `.js` copy.

`hook-handler.cjs` uses `safeRequire('router.js')`, `safeRequire('session.js')`, `safeRequire('memory.js')` — when only `.cjs` variants exist, the require fails silently and hooks degrade.

## Fix

Single compat sweep at the call site in `initializeProject()`, after both `writeHelpers()` and `writeStatusline()` have run. For each of `router`, `session`, `memory`, `statusline`: if only one extension exists, copy it to the other.

## Files Patched

- `init/executor.js`

## Ops

1 op in fix.py (SG-002: compat copies after helpers + statusline init)
