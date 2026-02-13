# claude-flow-patch

Community patches for [`@claude-flow/cli`](https://www.npmjs.com/package/@claude-flow/cli) **v3.1.0-alpha.39**.

These patches fix 18 bugs and missing features in the `@claude-flow/cli` npm package. They are applied at runtime via idempotent Python scripts that perform targeted string replacements on the npx-cached CLI source files.

## Quick Start

```bash
# Apply all patches (idempotent, safe to re-run)
bash patch-all.sh

# Verify patches are applied
bash check-patches.sh
```

## How It Works

1. `patch-all.sh` locates the `@claude-flow/cli` dist files in the npm/npx cache
2. Concatenates `lib/common.py` (shared `patch()`/`patch_all()` helpers) with each `fix.py`
3. Runs them as a single Python process that performs string replacements
4. Each patch is idempotent: skips if already applied, warns if source changed

The `check-patches.sh` sentinel runs on session start to detect npx cache wipes and auto-reapply.

## Target Version

| Package | Version |
|---------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.39` |

Patches target files under `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/`.

## Patch Index

### HW — Headless Worker Execution

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [HW-001](patch/HW-001-stdin-hang/) | [Headless workers hang -- stdin pipe never closed](https://github.com/ruvnet/claude-flow/issues/1111) | Critical | 1 |
| [HW-002](patch/HW-002-failures-swallowed/) | [Headless failures silently swallowed as success](https://github.com/ruvnet/claude-flow/issues/1112) | High | 1 |
| [HW-003](patch/HW-003-aggressive-intervals/) | [Worker scheduling intervals too aggressive](https://github.com/ruvnet/claude-flow/issues/1113) | High | 3 |

### DM — Daemon & Workers

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [DM-001](patch/DM-001-daemon-log-zero/) | [daemon.log always 0 bytes](https://github.com/ruvnet/claude-flow/issues/1116) | Medium | 3 |
| [DM-002](patch/DM-002-cpu-load-threshold/) | [maxCpuLoad=2.0 blocks all workers on multi-core](https://github.com/ruvnet/claude-flow/issues/1138) | Critical | 1 |
| [DM-003](patch/DM-003-macos-freemem/) | [macOS freemem() always ~0% -- workers blocked](https://github.com/ruvnet/claude-flow/issues/1077) | Critical | 1 |
| [DM-004](patch/DM-004-preload-worker-stub/) | [Preload worker stub + missing from defaults](https://github.com/ruvnet/claude-flow/issues/1139) | Enhancement | 2 |
| [DM-005](patch/DM-005-consolidation-worker-stub/) | [Consolidation worker stub (no decay/rebuild)](https://github.com/ruvnet/claude-flow/issues/1140) | Enhancement | 1 |

### CF — Config & Doctor

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [CF-001](patch/CF-001-doctor-yaml/) | [Doctor ignores YAML config files](https://github.com/ruvnet/claude-flow/issues/1141) | Low | 2 |
| [CF-002](patch/CF-002-config-export-yaml/) | [Config export shows hardcoded defaults](https://github.com/ruvnet/claude-flow/issues/1142) | Medium | 3 |

### EM — Embeddings & HNSW Init

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [EM-001](patch/EM-001-embedding-ignores-config/) | [Embedding system ignores project config (model + HNSW dims)](https://github.com/ruvnet/claude-flow/issues/1143) | High | 6 |
| [EM-002](patch/EM-002-transformers-cache-eacces/) | [@xenova/transformers cache EACCES](https://github.com/ruvnet/claude-flow/issues/1144) | Medium | shell |

### UI — Display & Cosmetic

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [UI-001](patch/UI-001-intelligence-stats-crash/) | [intelligence stats crashes on .toFixed()](https://github.com/ruvnet/claude-flow/issues/1145) | Critical | 7 |
| [UI-002](patch/UI-002-neural-status-not-loaded/) | [neural status shows "Not loaded"](https://github.com/ruvnet/claude-flow/issues/1146) | Low | 2 |

### NS — Memory Namespace

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [NS-001](patch/NS-001-discovery-default-namespace/) | [Discovery ops default to wrong namespace](https://github.com/ruvnet/claude-flow/issues/1123) | Critical | 10 |
| [NS-002](patch/NS-002-targeted-require-namespace/) | [Store/delete/retrieve fall back to 'default' + accept 'all'](https://github.com/ruvnet/claude-flow/issues/581) | Critical | 14 |
| [NS-003](patch/NS-003-namespace-typo-pattern/) | [Namespace typo 'pattern' vs 'patterns'](https://github.com/ruvnet/claude-flow/issues/1136) | Medium | 4 |

### GV — Ghost Vectors

| ID | Issue | Severity | Ops |
|----|-------|----------|-----|
| [GV-001](patch/GV-001-hnsw-ghost-vectors/) | [HNSW ghost vectors persist after memory delete](https://github.com/ruvnet/claude-flow/issues/1122) | Medium | 1 |

## Totals

- **18 issues** across 7 categories
- **~62 patch ops** (Python string replacements) + 1 shell fix
- **7 Critical**, 3 High, 5 Medium, 2 Low, 2 Enhancement

## Repository Structure

```
claude-flow-patch/
  README.md              # This file
  CLAUDE.md              # Claude Code instructions for working with patches
  AGENTS.md              # Agent instructions for automated patching
  patch-all.sh           # Apply all patches (entry point)
  check-patches.sh       # Sentinel: verify + auto-reapply
  lib/
    common.py            # Shared patch()/patch_all() helpers + path variables
  patch/
    HW-001-stdin-hang/
      issue.md           # Bug description, root cause, fix strategy
      fix.py             # Idempotent patch script
    HW-002-failures-swallowed/
      ...
    (18 issue directories total)
```

## Application Order

Patches are applied in a specific order by `patch-all.sh`. Notable dependency:

- **NS-001** must run before **NS-002** (namespace enforcement depends on discovery defaults)
- **NS-002** must run before **NS-003** (typo fix depends on namespace enforcement strings)

## Compatibility

- Tested against `@claude-flow/cli@3.1.0-alpha.39`
- Requires Python 3.6+ and Bash
- Works on Linux and macOS (DM-003 is macOS-only, auto-skipped on Linux)

## License

MIT
