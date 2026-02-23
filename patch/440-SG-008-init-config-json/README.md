# SG-008: init should generate .claude-flow/config.json (not config.yaml)

**Severity**: Enhancement
**GitHub**: [#1195](https://github.com/ruvnet/claude-flow/issues/1195)
**Related**: [#1200](https://github.com/ruvnet/claude-flow/issues/1200) — follow-up: replace YAML generation entirely

## Root Cause

`writeRuntimeConfig()` in `executor.js` generates `.claude-flow/config.yaml` as the project config file using a YAML template string, but all MCP config tools and runtime consumers now read `.claude-flow/config.json`. The YAML file is dead code after config-consolidation patches (WM-001, WM-002, CF-003, CF-004).

## Fix

Replace the entire YAML template generation in `writeRuntimeConfig()` with JSON generation. The config.json includes all sections that were in config.yaml (`swarm`, `memory`, `neural`, `hooks`, `mcp`) plus structured `learningBridge`, `memoryGraph`, and `agentScopes` subsections.

## Files Patched

- `init/executor.js`

## Ops

2 ops in fix.py
