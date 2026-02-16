# claude-flow-patch

Community patches for [`@claude-flow/cli`](https://www.npmjs.com/package/@claude-flow/cli) **v3.1.0-alpha.40** and [`ruv-swarm`](https://www.npmjs.com/package/ruv-swarm) **v1.0.20**.

These patches fix 22 bugs and missing features in the `@claude-flow/cli` and `ruv-swarm` npm packages. They are applied at runtime via idempotent Python scripts that perform targeted string replacements on the npx-cached source files.

## Quick Start

```bash
# Apply all patches to both global (npx cache) and local (node_modules)
bash patch-all.sh

# Apply only to global npx cache
bash patch-all.sh --scope global

# Apply only to local node_modules
bash patch-all.sh --scope local

# Verify patches are applied
bash check-patches.sh
```

### Scope Options

| Scope | Description |
|-------|-------------|
| `both` | Patch both global npx cache and local node_modules (default) |
| `global` | Patch only `~/.npm/_npx/*/node_modules/` |
| `local` | Patch only `./node_modules/` and parent directories |

**Why both?** When you run `npx @claude-flow/cli`, npm uses your local `node_modules` if present, otherwise the global npx cache. Patching both ensures fixes work regardless of how the CLI is invoked.

## How It Works

1. `patch-all.sh` locates the `@claude-flow/cli` dist files in the npm/npx cache
2. Concatenates `lib/common.py` (shared `patch()`/`patch_all()` helpers) with each `fix.py`
3. Runs them as a single Python process that performs string replacements
4. Each patch is idempotent: skips if already applied, warns if source changed

The `check-patches.sh` sentinel runs on session start to detect npx cache wipes and auto-reapply.

## Target Versions

| Package | Version |
|---------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.40` |
| `ruv-swarm` | `1.0.20` |

Patches target files under `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/` and `~/.npm/_npx/*/node_modules/ruv-swarm/`.

## Patch Index

### HW — Headless Worker Execution

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [HW&#8209;001](patch/HW-001-stdin-hang/) | Spawned headless workers hang indefinitely waiting for input that never arrives | [#1111](https://github.com/ruvnet/claude-flow/issues/1111) |
| [HW&#8209;002](patch/HW-002-failures-swallowed/) | Worker failures are silently reported as success, hiding errors from the caller | [#1112](https://github.com/ruvnet/claude-flow/issues/1112) |
| [HW&#8209;003](patch/HW-003-aggressive-intervals/) | Worker scheduling fires too frequently, wasting CPU on idle polling | [#1113](https://github.com/ruvnet/claude-flow/issues/1113) |

### DM — Daemon & Workers

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [DM&#8209;001](patch/DM-001-daemon-log-zero/) | daemon.log is always 0 bytes — no daemon output is ever persisted | [#1116](https://github.com/ruvnet/claude-flow/issues/1116) |
| [DM&#8209;002](patch/DM-002-cpu-load-threshold/) | Default maxCpuLoad of 2.0 blocks all workers on multi-core machines | [#1138](https://github.com/ruvnet/claude-flow/issues/1138) |
| [DM&#8209;003](patch/DM-003-macos-freemem/) | macOS `freemem()` reports ~0% available, blocking all worker scheduling | [#1077](https://github.com/ruvnet/claude-flow/issues/1077) |
| [DM&#8209;004](patch/DM-004-preload-worker-stub/) | Preload worker is referenced but has no implementation and is missing from defaults | [#1139](https://github.com/ruvnet/claude-flow/issues/1139) |
| [DM&#8209;005](patch/DM-005-consolidation-worker-stub/) | Consolidation worker has no decay or rebuild logic | [#1140](https://github.com/ruvnet/claude-flow/issues/1140) |

### CF — Config & Doctor

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [CF&#8209;001](patch/CF-001-doctor-yaml/) | `doctor` command only checks for JSON config, ignoring YAML config files | [#1141](https://github.com/ruvnet/claude-flow/issues/1141) |
| [CF&#8209;002](patch/CF-002-config-export-yaml/) | `config export` outputs hardcoded defaults instead of the actual project config | [#1142](https://github.com/ruvnet/claude-flow/issues/1142) |

### EM — Embeddings & HNSW Init

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [EM&#8209;001](patch/EM-001-embedding-ignores-config/) | Embedding system ignores project config for model name and HNSW dimensions | [#1143](https://github.com/ruvnet/claude-flow/issues/1143) |
| [EM&#8209;002](patch/EM-002-transformers-cache-eacces/) | `@xenova/transformers` cache directory has wrong permissions (EACCES) | [#1144](https://github.com/ruvnet/claude-flow/issues/1144) |

### UI — Display & Cosmetic

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [UI&#8209;001](patch/UI-001-intelligence-stats-crash/) | `hooks intelligence stats` crashes on `.toFixed()` of undefined SONA/MoE/embeddings fields | [#1145](https://github.com/ruvnet/claude-flow/issues/1145) |
| [UI&#8209;002](patch/UI-002-neural-status-not-loaded/) | `neural status` always shows "Not loaded" even when neural patterns exist | [#1146](https://github.com/ruvnet/claude-flow/issues/1146) |

### NS — Memory Namespace

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [NS&#8209;001](patch/NS-001-discovery-default-namespace/) | Search and list operations default to `'default'` namespace, missing entries in other namespaces | [#1123](https://github.com/ruvnet/claude-flow/issues/1123) |
| [NS&#8209;002](patch/NS-002-targeted-require-namespace/) | Store, delete, and retrieve silently fall back to `'default'` and accept `'all'` as a namespace | [#581](https://github.com/ruvnet/claude-flow/issues/581) |
| [NS&#8209;003](patch/NS-003-namespace-typo-pattern/) | Hardcoded namespace string `'pattern'` vs actual namespace `'patterns'` | [#1136](https://github.com/ruvnet/claude-flow/issues/1136) |

### GV — Ghost Vectors

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [GV&#8209;001](patch/GV-001-hnsw-ghost-vectors/) | Deleting a memory entry leaves orphaned vectors in the HNSW index | [#1122](https://github.com/ruvnet/claude-flow/issues/1122) |

### IN — Intelligence

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [IN&#8209;001](patch/IN-001-intelligence-stub/) | `init` generates 197-line intelligence stub instead of full 916-line version when source dir not found | [#1154](https://github.com/ruvnet/claude-flow/issues/1154) |

### SG — Settings Generator

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [SG&#8209;001](patch/SG-001-init-settings/) | Init generates invalid hooks and permission patterns | [#1150](https://github.com/ruvnet/claude-flow/issues/1150) |

### MM — Memory Management

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [MM&#8209;001](patch/MM-001-memory-persist-path/) | memory-initializer.js ignores persistPath config, hardcodes .swarm/ | [#1152](https://github.com/ruvnet/claude-flow/issues/1152) |

### HK — Hooks

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [HK&#8209;001](patch/HK-001-post-edit-file-path/) | post-edit hook records file_path as "unknown" — reads env var instead of stdin JSON | [#1155](https://github.com/ruvnet/claude-flow/issues/1155) |

### RS — ruv-swarm

| ID | Description <img width="600" height="1" /> | GitHub&nbsp;Issue |
|----|-------------|--------------|
| [RS&#8209;001](patch/RS-001-better-sqlite3-node24/) | `better-sqlite3@^11.6.0` lacks Node 24 prebuilt binaries — MCP server crashes on startup | [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185) |

## Totals

- **22 active patches** across 12 categories

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
      README.md          # Bug description, root cause, fix strategy
      fix.py             # Idempotent patch script
    HW-002-failures-swallowed/
      ...
    IN-001-intelligence-stub/
      README.md
      fix.py
    RS-001-better-sqlite3-node24/
      README.md
      fix.py
      rebuild.sh        # Post-patch: reinstall better-sqlite3@^12 with prebuilts
    (23 issue directories total, 22 with fix.py)
```

## Application Order

Patches are applied in a specific order by `patch-all.sh`. Notable dependency:

- **NS-001** must run before **NS-002** (namespace enforcement depends on discovery defaults)
- **NS-002** must run before **NS-003** (typo fix depends on namespace enforcement strings)

## Compatibility

- Tested against `@claude-flow/cli@3.1.0-alpha.40` and `ruv-swarm@1.0.20`
- Requires Python 3.6+ and Bash
- Works on Linux and macOS (DM-003 is macOS-only, auto-skipped on Linux)

## License

MIT
