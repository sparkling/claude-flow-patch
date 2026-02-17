# 1129: Hardcoded model display version in statusline/hooks

**Severity**: Medium
**GitHub**: [#1129](https://github.com/ruvnet/claude-flow/issues/1129)

## Root Cause

Model display names are hardcoded to `Opus 4.5` / `Sonnet 4` / `Haiku 4.5` in status rendering paths. Any newer model IDs (for example `claude-opus-4-6`) are displayed with stale version text.

## Fix

Replace hardcoded model labels with regex-based parsing from model IDs in both runtime hooks status output and init statusline generator output. Keep stable fallbacks (`Opus`, `Sonnet`, `Haiku`) when version tokens are missing.

## Files Patched

- commands/hooks.js
- init/statusline-generator.js

## Ops

3 ops in fix.py
