# SG-009: Remove --v3-mode from swarm init, make v3 the default

**Severity**: High
**GitHub**: [#1202](https://github.com/ruvnet/claude-flow/issues/1202)

## Root Cause

`claude-flow swarm init` defaults to `topology: 'hierarchical'`, contradicting
`claude-flow init` which defaults to `'hierarchical-mesh'`. The `--v3-mode`
boolean flag gates the correct topology and several output lines behind an
opt-in flag. Running `init` then `swarm init` silently downgrades topology.

## Fix

Remove `--v3-mode` entirely. Make v3 defaults (hierarchical-mesh) the only path.

| Op | What |
|----|------|
| a | topology option default `'hierarchical'` -> `'hierarchical-mesh'` |
| b | remove `--v3-mode` option declaration + `const v3Mode` + `if (v3Mode)` override |
| c | interactive selector default `'hierarchical'` -> `'hierarchical-mesh'` |
| d | remove `if (v3Mode)` guard around Flash Attention/AgentDB/SONA output lines |
| e | remove V3 Mode row from status table |
| f | remove v3Mode from MCP metadata |
| g | remove v3Mode from saved state.json |
| h | update example from `--v3-mode` to plain `swarm init` |
| i | remove `--v3-mode` from CLI help text in index.js |
| j | remove `--v3-mode` from CLAUDE.md template in claudemd-generator.js |
| k | remove v3Mode from start-all swarm_init call in start.js |
| l | remove v3Mode from config init defaults in config.js |
| m | remove V3 Mode row from config show table |
| n | remove v3Mode from config get defaults |
| o | config init topology `'hybrid'` -> `'hierarchical-mesh'` |
| p | config get topology default `'hybrid'` -> `'hierarchical-mesh'` |
| q | config export topology `'hybrid'` -> `'hierarchical-mesh'` |

## Files Patched

- commands/swarm.js
- index.js
- init/claudemd-generator.js
- commands/start.js
- commands/config.js

## Ops

17 ops in fix.py
