# SG-010: Add CLI options to init for all config.json settings

**Severity**: Enhancement
**GitHub**: [#1205](https://github.com/ruvnet/claude-flow/issues/1205)

## Root Cause

The `init` command has no CLI flags for most config.json settings. Users must edit
config.json manually after init. Additionally, `cacheSize` defaults to 100 in
executor.js but 256 everywhere else (embeddings-tools.js, settings-generator.js).

## Fix

14 ops add 21 CLI option declarations, wire them through to config.json generation,
and clean up stale cache duplication.

| Op | File | What |
|----|------|------|
| a | commands/init.js | Add 13 option declarations after `--dual` |
| b | commands/init.js | Wire 13 CLI flags into options.runtime/options.mcp |
| c | init/executor.js | Wire options into config.json template, fix cacheSize 100→256 |
| d | commands/init.js | Add 3 CLI examples |
| e | commands/init.js | Add 7 more option declarations (topology thru access-boost-amount) |
| f | commands/init.js | Wire 7 new flags into options |
| g | init/executor.js | Wire accessBoostAmount, hooks, modelPath from options (3 sub-patches) |
| h | commands/init.js | Add 2 CLI examples (topology, hooks) |
| i | commands/init.js + init/executor.js | Add `--default-scope` option, wiring, and template (3 sub-patches) |
| j | commands/init.js | Deduplicate SG-010b wiring block (stale cache cleanup) |

**New CLI options (a-d)**: `--cache-size`, `--coordination-strategy`, `--auto-scale`,
`--mcp-port`, `--mcp-auto-start`, `--memory-backend`, `--neural`, `--sona-mode`,
`--confidence-decay-rate`, `--consolidation-threshold`, `--page-rank-damping`,
`--max-memory-nodes`, `--similarity-threshold`.

**New CLI options (e-h)**: `--topology`, `--max-agents`, `--enable-hnsw`,
`--model-path`, `--hooks`, `--auto-execute`, `--access-boost-amount`.

**New CLI option (i)**: `--default-scope`.

## Files Patched

- `commands/init.js`
- `init/executor.js`

## Ops

14 ops in fix.py
