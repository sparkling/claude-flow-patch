# 1014: init-generated commands use internal package name `@claude-flow/cli@latest`

**Severity**: High
**GitHub**: [#1014](https://github.com/ruvnet/claude-flow/issues/1014)

## Root Cause

Init and generator outputs include `npx @claude-flow/cli@latest ...` in runnable commands. This references the internal package path instead of the published package command path, causing command failures in generated workflows.

## Fix

Normalize generated command strings to use the published package invocation:
- Replace `npx @claude-flow/cli@latest` with `npx claude-flow@latest`.
- Replace `@claude-flow/cli@latest` argument entries used by MCP config generation with `claude-flow@latest`.

## Files Patched

- init/mcp-generator.js
- commands/init.js
- init/settings-generator.js
- init/executor.js
- init/claudemd-generator.js

## Verification

- `npx @claude-flow/cli@latest init --dry-run` (or generated output inspection)
- Confirm generated strings and mcp args use `claude-flow@latest`.

## Ops

5 ops in fix.py
