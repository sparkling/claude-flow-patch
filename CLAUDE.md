# Claude Code Configuration -- claude-flow-patch

Patches for `@claude-flow/cli` **v3.1.0-alpha.40** and `ruv-swarm` **v1.0.20**.

## Rules

- NEVER modify files inside the npm/npx cache directly -- always edit `fix.py` scripts in `patch/`
- ALWAYS run `bash patch-all.sh` to apply changes, never run individual `fix.py` files standalone
- ALWAYS verify with `bash check-patches.sh` after applying
- Each `fix.py` uses `patch()` or `patch_all()` from `lib/common.py` -- these are idempotent
- Patch order matters: NS-001 before NS-002 before NS-003

## Project Structure

```
patch-all.sh           # Orchestrator -- applies all patches in order
check-patches.sh       # Sentinel -- detects wipes, auto-reapplies
lib/common.py          # Shared helpers: patch(), patch_all(), file paths
patch/                 # One directory per issue
  {ID}-{slug}/
    issue.md           # Bug report: title, severity, root cause, fix
    fix.py             # Idempotent patch (uses patch()/patch_all())
```

## Target

- Package: `@claude-flow/cli@3.1.0-alpha.40`
- Location: `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/`
- The `BASE` env var is set by `patch-all.sh` to the `dist/src/` directory
- Package: `ruv-swarm@1.0.20`
- Location: `~/.npm/_npx/*/node_modules/ruv-swarm/`
- RS patches find their own target paths via glob (not `BASE`)

## Patch Categories

| Prefix | Category | Count |
|--------|----------|-------|
| HW | Headless Worker Execution | 3 |
| DM | Daemon & Workers | 5 |
| CF | Config & Doctor | 2 |
| EM | Embeddings & HNSW Init | 2 |
| UI | Display & Cosmetic | 2 |
| NS | Memory Namespace | 3 |
| GV | Ghost Vectors | 1 |
| RS | ruv-swarm | 1 |

## All 20 Patches

| ID | GitHub Issue | Severity |
|----|-------------|----------|
| HW-001 | [#1111 Headless workers hang -- stdin pipe never closed](https://github.com/ruvnet/claude-flow/issues/1111) | Critical |
| HW-002 | [#1112 Headless failures silently swallowed as success](https://github.com/ruvnet/claude-flow/issues/1112) | High |
| HW-003 | [#1113 Worker scheduling intervals too aggressive](https://github.com/ruvnet/claude-flow/issues/1113) | High |
| DM-001 | [#1116 daemon.log always 0 bytes](https://github.com/ruvnet/claude-flow/issues/1116) | Medium |
| DM-002 | [#1138 maxCpuLoad=2.0 blocks all workers on multi-core](https://github.com/ruvnet/claude-flow/issues/1138) | Critical |
| DM-003 | [#1077 macOS freemem() always ~0% -- workers blocked](https://github.com/ruvnet/claude-flow/issues/1077) | Critical |
| DM-004 | [#1139 Preload worker stub + missing from defaults](https://github.com/ruvnet/claude-flow/issues/1139) | Enhancement |
| DM-005 | [#1140 Consolidation worker stub (no decay/rebuild)](https://github.com/ruvnet/claude-flow/issues/1140) | Enhancement |
| CF-001 | [#1141 Doctor ignores YAML config files](https://github.com/ruvnet/claude-flow/issues/1141) | Low |
| CF-002 | [#1142 Config export shows hardcoded defaults](https://github.com/ruvnet/claude-flow/issues/1142) | Medium |
| EM-001 | [#1143 Embedding system ignores project config](https://github.com/ruvnet/claude-flow/issues/1143) | High |
| EM-002 | [#1144 @xenova/transformers cache EACCES](https://github.com/ruvnet/claude-flow/issues/1144) | Medium |
| UI-001 | [#1145 intelligence stats crashes on .toFixed()](https://github.com/ruvnet/claude-flow/issues/1145) | Critical |
| UI-002 | [#1146 neural status shows "Not loaded"](https://github.com/ruvnet/claude-flow/issues/1146) | Low |
| NS-001 | [#1123 Discovery ops default to wrong namespace](https://github.com/ruvnet/claude-flow/issues/1123) | Critical |
| NS-002 | [#581 Store/delete/retrieve fall back to 'default' + accept 'all'](https://github.com/ruvnet/claude-flow/issues/581) | Critical |
| NS-003 | [#1136 Namespace typo 'pattern' vs 'patterns'](https://github.com/ruvnet/claude-flow/issues/1136) | Medium |
| GV-001 | [#1122 HNSW ghost vectors persist after memory delete](https://github.com/ruvnet/claude-flow/issues/1122) | Medium |
| SG-001 | [#1150 Init generates invalid hooks and permissions](https://github.com/ruvnet/claude-flow/issues/1150) | High |
| MM-001 | [#1152 memory-initializer.js ignores persistPath](https://github.com/ruvnet/claude-flow/issues/1152) | Medium |
| RS-001 | [ruv-FANN#185 ruv-swarm: better-sqlite3 lacks Node 24 binaries](https://github.com/ruvnet/ruv-FANN/issues/185) | Critical |

## Writing a New Patch

1. Create `patch/{PREFIX}-{NNN}-{slug}/issue.md` with: title, severity, root cause, fix strategy
2. Create `patch/{PREFIX}-{NNN}-{slug}/fix.py` using `patch()` or `patch_all()` from `lib/common.py`
3. Add the new directory to the appropriate section in `patch-all.sh`
4. Update sentinel checks in `check-patches.sh` if needed
5. Run `bash patch-all.sh` and verify

## Commands

```bash
# Apply all patches
bash patch-all.sh

# Verify patches
bash check-patches.sh

# Check target version
grep '"version"' ~/.npm/_npx/*/node_modules/@claude-flow/cli/package.json
```
