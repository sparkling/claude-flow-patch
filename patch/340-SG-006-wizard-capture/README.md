# SG-006: Wizard captures permissionRequest hook but never assigns it + topology hardcoded

**Severity**: Medium
**GitHub**: [#1184](https://github.com/ruvnet/claude-flow/issues/1184)

## Root Cause

In `commands/init.js`, the hooks multiSelect block assigns all selected hooks to
`options.hooks.*` except `permissionRequest` -- that value is collected but silently
dropped because there is no corresponding assignment line.

Separately, the `--start-all` code path at ~line 678 uses a hardcoded string
`--topology hierarchical` instead of interpolating `options.runtime.topology`
(which the user selects at line 519 and defaults to `'hierarchical-mesh'`).

## Fix

| Op | What it does |
|----|-------------|
| SG-006b | After the last `options.hooks.*` assignment (`notification`), adds `options.hooks.permissionRequest = hooks.includes('permissionRequest');` |
| SG-006c | Replaces hardcoded `--topology hierarchical` with template using `options.runtime.topology \|\| 'hierarchical-mesh'` |

## Files Patched

- `commands/init.js`

## Ops

2 ops in fix.py
