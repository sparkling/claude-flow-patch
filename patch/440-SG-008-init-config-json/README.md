# SG-008: init should generate .claude-flow/config.json

**Severity**: Enhancement
**GitHub**: [#1195](https://github.com/ruvnet/claude-flow/issues/1195)

## Root Cause

`writeRuntimeConfig()` in `executor.js` generates `.claude-flow/config.yaml` as the project config file, but the MCP config tools (`config_get`, `config_set`, `config_list`, `config_export`) all operate on `.claude-flow/config.json`. This means init creates a file that the config CRUD tools don't read.

## Fix

Add config.json generation after the existing config.yaml write in `writeRuntimeConfig()`. The JSON file mirrors the same values from `options.runtime` in a structured JSON format that `JSON.parse` can read directly.

## Files Patched

- `init/executor.js`

## Ops

1 op in fix.py
