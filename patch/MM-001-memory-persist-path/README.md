# MM-001: Remove dead persistPath config option

**Severity**: Low
**GitHub**: [#1152](https://github.com/ruvnet/claude-flow/issues/1152)

## Root Cause

The `init` command generates a `persistPath: .claude-flow/data` setting in config.yaml, but **nothing reads it**. All memory storage code (15+ locations across memory-initializer.js and ruvector modules) uses hardcoded `.swarm/` paths.

This creates user confusion: the config suggests data goes to `.claude-flow/data/` but it actually goes to `.swarm/`.

## Fix

Rather than patching 15+ files to respect the config, we:
1. Remove the misleading `persistPath` line from the generated config.yaml
2. Revert any previous attempts to read this config (restore `.swarm/` hardcoding)

This aligns the config with actual behavior - all data lives in `.swarm/`.

## Files Patched

- init/executor.js (remove persistPath from config template)
- memory/memory-initializer.js (revert config-reading code if present)

## Ops

2 ops in fix.py
