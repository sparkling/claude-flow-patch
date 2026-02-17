# 1083: status bar hardcodes Opus 4.5 model label

**Severity**: Medium
**GitHub**: [#1083](https://github.com/ruvnet/claude-flow/issues/1083)

## Root Cause

Model display text in hooks/statusline paths uses hardcoded labels (`Opus 4.5`, `Sonnet 4`, `Haiku 4.5`) instead of parsing active model IDs.

## Fix

Parse model version dynamically from model IDs with regex in both runtime hooks status rendering and init statusline generator output.

## Files Patched

- commands/hooks.js
- init/statusline-generator.js

## Ops

3 ops in fix.py
