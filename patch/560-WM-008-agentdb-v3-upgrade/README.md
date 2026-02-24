# WM-008: Upgrade AgentDB v2 to v3 (RVF backend, self-learning, witness chain)

**Severity**: High
**GitHub**: [#1207](https://github.com/ruvnet/claude-flow/issues/1207)

## Root Cause

`@claude-flow/memory` depends on `agentdb@2.0.0-alpha.3.7` (37 hard deps, native
bindings). AgentDB v3 (`3.0.0-alpha.3`) cuts to 5 deps (zero native via sql.js WASM
fallback), adds unified `.rvf` single-file storage, self-learning search via
`SelfLearningRvfBackend`, and a SHAKE-256 witness chain for tamper detection.

Multiple packages reference agentdb v2 APIs, paths, or version strings:

- `@claude-flow/memory` — `AgentDBBackend` hardcodes `vectorBackend: 'auto'`, package.json pins v2
- `@claude-flow/cli` — `memory-initializer.js`, `helpers-generator.js`, `auto-memory-hook.mjs`, `executor.js` all use `.db` paths and v2 config
- `@claude-flow/neural` — `reasoning-bank.js` uses `vectorBackend: 'auto'`
- `@claude-flow/shared` — `defaults.js` missing `vectorBackend` field

## Fix

15 ops in fix.py + 1 fix.sh (package upgrade) across 8 files in 4 packages:

| Op | Package | File | Change |
|----|---------|------|--------|
| A | @claude-flow/memory | agentdb-backend.js | `vectorBackend: 'auto'` -> `'rvf'` |
| B | @claude-flow/memory | agentdb-backend.js | Add `save()` before `close()` in shutdown for unified mode; destroy learning backend |
| C | @claude-flow/memory | agentdb-backend.js | Import `SelfLearningRvfBackend` alongside AgentDB |
| D | @claude-flow/memory | agentdb-backend.js | Create learning backend when `config.enableLearning`; capture witness chain hash in init event |
| E | @claude-flow/memory | agentdb-backend.js | Add `recordFeedback()` method for self-learning |
| F | @claude-flow/memory | agentdb-backend.js | Add `getWitnessChain()` / `verifyWitnessChain()` methods |
| G | @claude-flow/cli | memory-initializer.js | `.db` -> `.rvf`, add `vectorBackend: 'rvf'` + learning config from config.json |
| H | @claude-flow/cli | executor.js | Add `agentdb` subsection to config.json template |
| I | @claude-flow/memory | package.json | Update agentdb dep `2.0.0-alpha.3.7` -> `3.0.0-alpha.3` |
| J | @claude-flow/memory | agentdb-backend.js | Update header comment version |
| K | @claude-flow/cli | helpers-generator.js | `.db` -> `.rvf` + `vectorBackend: 'rvf'` (3 HybridBackend blocks) |
| L | @claude-flow/cli | auto-memory-hook.mjs | `.db` -> `.rvf` + v3 config |
| M | @claude-flow/neural | reasoning-bank.js | `vectorBackend: 'auto'` -> `'rvf'` |
| N | @claude-flow/shared | defaults.js | Add `vectorBackend: 'rvf'` to agentdb defaults |
| O | @claude-flow/cli | executor.js | Update version table `2.0.0-alpha.3.4` -> `3.0.0-alpha.3` |

fix.sh upgrades the agentdb npm package from v2 to v3 via `npm pack` + `tar extract`.

## Files Patched

- `@claude-flow/memory` `dist/agentdb-backend.js` (ops A-F, J)
- `@claude-flow/memory` `package.json` (op I)
- `@claude-flow/cli` `memory/memory-initializer.js` (op G)
- `@claude-flow/cli` `init/executor.js` (ops H, O)
- `@claude-flow/cli` `init/helpers-generator.js` (op K)
- `@claude-flow/cli` `.claude/helpers/auto-memory-hook.mjs` (op L)
- `@claude-flow/neural` `dist/reasoning-bank.js` (op M)
- `@claude-flow/shared` `dist/core/config/defaults.js` (op N)

## Ops

15 ops in fix.py, 1 fix.sh
