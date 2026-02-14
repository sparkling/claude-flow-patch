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

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[HW-001](patch/HW-001-stdin-hang/)</nobr> | Spawned headless workers hang indefinitely waiting for input that never arrives | [#1111](https://github.com/ruvnet/claude-flow/issues/1111) |
| <nobr>[HW-002](patch/HW-002-failures-swallowed/)</nobr> | Worker failures are silently reported as success, hiding errors from the caller | [#1112](https://github.com/ruvnet/claude-flow/issues/1112) |
| <nobr>[HW-003](patch/HW-003-aggressive-intervals/)</nobr> | Worker scheduling fires too frequently, wasting CPU on idle polling | [#1113](https://github.com/ruvnet/claude-flow/issues/1113) |

### DM — Daemon & Workers

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[DM-001](patch/DM-001-daemon-log-zero/)</nobr> | daemon.log is always 0 bytes — no daemon output is ever persisted | [#1116](https://github.com/ruvnet/claude-flow/issues/1116) |
| <nobr>[DM-002](patch/DM-002-cpu-load-threshold/)</nobr> | Default maxCpuLoad of 2.0 blocks all workers on multi-core machines | [#1138](https://github.com/ruvnet/claude-flow/issues/1138) |
| <nobr>[DM-003](patch/DM-003-macos-freemem/)</nobr> | macOS `freemem()` reports ~0% available, blocking all worker scheduling | [#1077](https://github.com/ruvnet/claude-flow/issues/1077) |
| <nobr>[DM-004](patch/DM-004-preload-worker-stub/)</nobr> | Preload worker is referenced but has no implementation and is missing from defaults | [#1139](https://github.com/ruvnet/claude-flow/issues/1139) |
| <nobr>[DM-005](patch/DM-005-consolidation-worker-stub/)</nobr> | Consolidation worker has no decay or rebuild logic | [#1140](https://github.com/ruvnet/claude-flow/issues/1140) |

### CF — Config & Doctor

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[CF-001](patch/CF-001-doctor-yaml/)</nobr> | `doctor` command only checks for JSON config, ignoring YAML config files | [#1141](https://github.com/ruvnet/claude-flow/issues/1141) |
| <nobr>[CF-002](patch/CF-002-config-export-yaml/)</nobr> | `config export` outputs hardcoded defaults instead of the actual project config | [#1142](https://github.com/ruvnet/claude-flow/issues/1142) |

### EM — Embeddings & HNSW Init

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[EM-001](patch/EM-001-embedding-ignores-config/)</nobr> | Embedding system ignores project config for model name and HNSW dimensions | [#1143](https://github.com/ruvnet/claude-flow/issues/1143) |
| <nobr>[EM-002](patch/EM-002-transformers-cache-eacces/)</nobr> | `@xenova/transformers` cache directory has wrong permissions (EACCES) | [#1144](https://github.com/ruvnet/claude-flow/issues/1144) |

### UI — Display & Cosmetic

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[UI-001](patch/UI-001-intelligence-stats-crash/)</nobr> | `intelligence stats` command crashes with `.toFixed()` on undefined values | [#1145](https://github.com/ruvnet/claude-flow/issues/1145) |
| <nobr>[UI-002](patch/UI-002-neural-status-not-loaded/)</nobr> | `neural status` always shows "Not loaded" even when neural patterns exist | [#1146](https://github.com/ruvnet/claude-flow/issues/1146) |

### NS — Memory Namespace

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[NS-001](patch/NS-001-discovery-default-namespace/)</nobr> | Search and list operations default to `'default'` namespace, missing entries in other namespaces | [#1123](https://github.com/ruvnet/claude-flow/issues/1123) |
| <nobr>[NS-002](patch/NS-002-targeted-require-namespace/)</nobr> | Store, delete, and retrieve silently fall back to `'default'` and accept `'all'` as a namespace | [#581](https://github.com/ruvnet/claude-flow/issues/581) |
| <nobr>[NS-003](patch/NS-003-namespace-typo-pattern/)</nobr> | Hardcoded namespace string `'pattern'` vs actual namespace `'patterns'` | [#1136](https://github.com/ruvnet/claude-flow/issues/1136) |

### GV — Ghost Vectors

| ID | Description | GitHub Issue |
|----|-------------|--------------|
| <nobr>[GV-001](patch/GV-001-hnsw-ghost-vectors/)</nobr> | Deleting a memory entry leaves orphaned vectors in the HNSW index | [#1122](https://github.com/ruvnet/claude-flow/issues/1122) |

## Totals

- **18 issues** across 7 categories

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
