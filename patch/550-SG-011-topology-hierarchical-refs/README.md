# SG-011: Fix stale --topology hierarchical references

**Severity**: Medium
**GitHub**: [#1206](https://github.com/ruvnet/claude-flow/issues/1206)

## Root Cause

SG-009 updated swarm.js, config.js, start.js, index.js, and claudemd-generator.js
to remove `--v3-mode` and use `hierarchical-mesh` as the default topology, but missed
5 occurrences of `--topology hierarchical` in init-related files:

- `commands/init.js` line 323: `--start-all` exec command
- `init/claudemd-generator.js` lines 91, 103: anti-drift and auto-start templates
- `init/executor.js` lines 1327, 1636: CAPABILITIES.md quick commands

## Fix

3 ops fix all 5 references:

| Op | File | Count | Change |
|----|------|-------|--------|
| a | commands/init.js | 1 | `--topology hierarchical 2>` → `--topology hierarchical-mesh 2>` |
| b | init/claudemd-generator.js | 2 | `--topology hierarchical --max-agents 8` → `--topology hierarchical-mesh --max-agents 8` |
| c | init/executor.js | 2 | `--topology hierarchical --max-agents 8` → `--topology hierarchical-mesh --max-agents 8` |

## Files Patched

- `commands/init.js`
- `init/claudemd-generator.js`
- `init/executor.js`

## Ops

3 ops in fix.py
