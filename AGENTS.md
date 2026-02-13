# AGENTS.md -- claude-flow-patch

Agent instructions for automated patch management of `@claude-flow/cli` **v3.1.0-alpha.39**.

## Purpose

This repository contains 18 runtime patches for the `@claude-flow/cli` npm package. Patches fix bugs in the published npm tarball by performing idempotent string replacements on the npx-cached source files.

## Agent Responsibilities

### Patch Application Agent

**Goal**: Keep patches applied after npx cache updates.

1. Run `bash check-patches.sh` to detect missing patches
2. If patches are missing, run `bash patch-all.sh`
3. Restart the daemon: `npx @claude-flow/cli@latest daemon stop && npx @claude-flow/cli@latest daemon start`
4. Verify: `bash check-patches.sh` should output `[PATCHES] OK`

### Patch Development Agent

**Goal**: Create new patches for newly discovered bugs.

1. Identify the bug in the target file under `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/`
2. Create directory: `patch/{PREFIX}-{NNN}-{slug}/`
3. Write `issue.md` with: `# {PREFIX}-{NNN}: Title`, severity, root cause, fix, affected files, ops count
4. Write `fix.py` using `patch(label, filepath, old, new)` or `patch_all(label, filepath, old, new)`
5. Register in `patch-all.sh` in the correct category section
6. Test: `bash patch-all.sh` (should show "Applied: ...")
7. Test idempotency: run again (should show "skipped already present")

### Patch Verification Agent

**Goal**: Confirm all patches are correctly applied.

1. Run `bash check-patches.sh`
2. Grep the target files for expected strings listed in each `issue.md`
3. Run `npx @claude-flow/cli@latest doctor` to confirm system health
4. Run `npx @claude-flow/cli@latest memory search --query "test"` to confirm namespace patches

## Patch Overview

### Headless Worker Execution (HW)

| ID | Issue | Fix |
|----|-------|-----|
| HW-001 | [#1111 stdin pipe never closed](https://github.com/ruvnet/claude-flow/issues/1111) | Change stdin to `'ignore'` |
| HW-002 | [#1112 Failures swallowed as success](https://github.com/ruvnet/claude-flow/issues/1112) | Check `result.success` after execution |
| HW-003 | [#1113 Intervals too aggressive](https://github.com/ruvnet/claude-flow/issues/1113) | Align to ADR-020 (30/60/60m) |

### Daemon & Workers (DM)

| ID | Issue | Fix |
|----|-------|-----|
| DM-001 | [#1116 daemon.log always 0 bytes](https://github.com/ruvnet/claude-flow/issues/1116) | Fix ESM import + path alignment |
| DM-002 | [#1138 maxCpuLoad blocks multi-core](https://github.com/ruvnet/claude-flow/issues/1138) | Raise threshold per core count |
| DM-003 | [#1077 macOS freemem() ~0%](https://github.com/ruvnet/claude-flow/issues/1077) | Skip check on macOS |
| DM-004 | [#1139 Preload worker stub](https://github.com/ruvnet/claude-flow/issues/1139) | Implement real preload with `loadEmbeddingModel()` |
| DM-005 | [#1140 Consolidation worker stub](https://github.com/ruvnet/claude-flow/issues/1140) | Implement `applyTemporalDecay()` + HNSW rebuild |

### Config & Doctor (CF)

| ID | Issue | Fix |
|----|-------|-----|
| CF-001 | [#1141 Doctor ignores YAML](https://github.com/ruvnet/claude-flow/issues/1141) | Add YAML paths, skip JSON.parse for non-JSON |
| CF-002 | [#1142 Config export hardcoded](https://github.com/ruvnet/claude-flow/issues/1142) | Read from `config.yaml`, merge over defaults |

### Embeddings & HNSW (EM)

| ID | Issue | Fix |
|----|-------|-----|
| EM-001 | [#1143 Ignores embeddings.json config](https://github.com/ruvnet/claude-flow/issues/1143) | Read model/dims from `.claude-flow/embeddings.json` |
| EM-002 | [#1144 Transformers cache EACCES](https://github.com/ruvnet/claude-flow/issues/1144) | Fix cache directory permissions |

### Display & Cosmetic (UI)

| ID | Issue | Fix |
|----|-------|-----|
| UI-001 | [#1145 .toFixed() crash](https://github.com/ruvnet/claude-flow/issues/1145) | Add null checks with 'N/A' fallback |
| UI-002 | [#1146 "Not loaded" status](https://github.com/ruvnet/claude-flow/issues/1146) | Call init functions before reading status |

### Memory Namespace (NS)

| ID | Issue | Fix |
|----|-------|-----|
| NS-001 | [#1123 Discovery defaults to wrong ns](https://github.com/ruvnet/claude-flow/issues/1123) | Default search/list to namespace 'all' |
| NS-002 | [#581 Store/delete accept 'all'](https://github.com/ruvnet/claude-flow/issues/581) | Require explicit namespace, block 'all' sentinel |
| NS-003 | [#1136 'pattern' vs 'patterns' typo](https://github.com/ruvnet/claude-flow/issues/1136) | Fix 4 occurrences in hooks-tools.js |

### Ghost Vectors (GV)

| ID | Issue | Fix |
|----|-------|-----|
| GV-001 | [#1122 Ghost vectors after delete](https://github.com/ruvnet/claude-flow/issues/1122) | Remove from HNSW entries Map + save metadata |

## Key Design Decisions

- **Idempotent**: Every `fix.py` uses `patch()` which checks if `new` string is already present
- **Order-dependent**: NS patches must apply in order (001 -> 002 -> 003)
- **Config-driven**: EM-001 reads from `embeddings.json`, not hardcoded values
- **Platform-aware**: DM-003 is macOS-only (auto-skipped on Linux)
- **Non-destructive**: Patches only modify the npx cache, never the npm registry package

## File Reference

| File | Purpose |
|------|---------|
| `patch-all.sh` | Apply all patches in dependency order |
| `check-patches.sh` | Sentinel: detect wipes + auto-reapply |
| `lib/common.py` | `patch()`, `patch_all()`, target file paths |
| `patch/{ID}/issue.md` | Bug description, root cause, fix strategy |
| `patch/{ID}/fix.py` | Idempotent patch operations |
