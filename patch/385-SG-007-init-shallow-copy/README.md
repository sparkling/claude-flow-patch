# SG-007: --skip-claude / --only-claude mutate shared init options via shallow copy

**Severity**: Medium
**GitHub**: [#1188](https://github.com/ruvnet/claude-flow/issues/1188)

## Root Cause

`commands/init.js` uses `{ ...DEFAULT_INIT_OPTIONS }` (shallow spread) then mutates nested
`options.components.*` properties. This permanently modifies the original constant's nested
objects since spread only copies the top level.

Same pattern in the wizard path with `Object.assign(options, MINIMAL_INIT_OPTIONS)`.

## Fix

Replace shallow spread with deep clone using `JSON.parse(JSON.stringify(...))` for all
preset option spreads in both `initAction` and the wizard action.

## Files Patched

- commands/init.js

## Ops

6 ops in fix.py
