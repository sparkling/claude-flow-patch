# CF-009: Upgrade MINIMAL init preset to v3 runtime defaults

**Severity**: High
**GitHub**: [#1203](https://github.com/ruvnet/claude-flow/issues/1203)

## Root Cause

`MINIMAL_INIT_OPTIONS.runtime` in `init/types.js` hardcodes legacy values:
`topology: 'mesh'`, `maxAgents: 5`, `memoryBackend: 'memory'`, and all feature
flags disabled. The MINIMAL preset correctly reduces components/hooks/skills but
hobbles the runtime below functional thresholds for no benefit.

## Fix

Replace the MINIMAL runtime block with v3 defaults (matching `DEFAULT_INIT_OPTIONS.runtime`):
`topology: 'hierarchical-mesh'`, `maxAgents: 15`, `memoryBackend: 'hybrid'`,
all feature flags enabled.

## Files Patched

- init/types.js

## Ops

1 op in fix.py
