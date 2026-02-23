# SG-010: Add CLI options to init for all config.json settings

**Severity**: Enhancement
**GitHub**: [#1205](https://github.com/ruvnet/claude-flow/issues/1205)

## Root Cause

The `init` command has no CLI flags for most config.json settings. Users must edit
config.json manually after init. Additionally, `cacheSize` defaults to 100 in
executor.js but 256 everywhere else (embeddings-tools.js, settings-generator.js).

## Fix

4 ops add 13 CLI option declarations and wire them through to config.json generation.

| Op | File | What |
|----|------|------|
| a | commands/init.js | Add 13 option declarations after `--dual` |
| b | commands/init.js | Wire CLI flags into options.runtime/options.mcp |
| c | init/executor.js | Wire options into config.json template, fix cacheSize 100→256 |
| d | commands/init.js | Add 3 CLI examples |

**New CLI options**: `--cache-size`, `--coordination-strategy`, `--auto-scale`,
`--mcp-port`, `--mcp-auto-start`, `--memory-backend`, `--neural`, `--sona-mode`,
`--confidence-decay-rate`, `--consolidation-threshold`, `--page-rank-damping`,
`--max-memory-nodes`, `--similarity-threshold`.

## Files Patched

- `commands/init.js`
- `init/executor.js`

## Ops

4 ops in fix.py
