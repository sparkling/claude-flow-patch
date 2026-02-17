# claude-flow-patch

Community patches for [`@claude-flow/cli`](https://www.npmjs.com/package/@claude-flow/cli) **v3.1.0-alpha.41**, [`ruvector`](https://www.npmjs.com/package/ruvector), and [`ruv-swarm`](https://www.npmjs.com/package/ruv-swarm) **v1.0.20**.

These patches fix 29 defects across 13 categories. They are applied at runtime via idempotent Python scripts that perform targeted string replacements on the npx-cached source files.

## Quick Start

**Patch before init.** Several patches fix the init/generator scripts. If you run `claude-flow init` before patching, the generated `.claude/helpers/` files will be stubs with no learning, no PageRank, and no-op feedback. Always patch first:

```bash
# 1. Patch first -- fixes the init generators
npx --yes claude-flow-patch --scope both

# 2. Then init (or re-init if already initialized)
npx @claude-flow/cli@latest init            # fresh project
npx @claude-flow/cli@latest init upgrade    # existing project

# 3. Verify
npx --yes claude-flow-patch check
```

If you already initialized before patching:

```bash
npx --yes claude-flow-patch repair --target /path/to/project
```

### Scope Options

```bash
npx --yes claude-flow-patch                      # both global + local (default)
npx --yes claude-flow-patch --scope global       # only ~/.npm/_npx/*/node_modules/
npx --yes claude-flow-patch --scope local        # only ./node_modules/ and parents
```

**Why both scopes?** `npx @claude-flow/cli` uses your local `node_modules` if present, otherwise the global npx cache. Patching both ensures fixes work regardless of how the CLI is invoked.

## CLI Commands

| Command | Purpose |
|---|---|
| `claude-flow-patch [--scope global\|local\|both]` | Apply all patches (default) |
| `claude-flow-patch apply <ID>` | Apply a single patch by defect ID (e.g. `SG-002`) |
| `claude-flow-patch check` | Verify patch sentinels and auto-detect drift |
| `claude-flow-patch repair --target <dir> [--source auto\|local\|global] [--dry-run]` | Rehydrate `.claude/helpers` in projects initialized before patching |

## How It Works

1. `patch-all.sh` locates the `@claude-flow/cli` dist files in the npm/npx cache
2. Concatenates `lib/common.py` (shared `patch()`/`patch_all()` helpers) with each `fix.py`
3. Runs them as a single Python process that performs string replacements
4. Each patch is idempotent: skips if already applied, warns if source changed

The `check-patches.sh` sentinel runs on session start to detect npx cache wipes and auto-reapply.

### Target Packages

| Package | Version | Location | Env var |
|---------|---------|----------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.41` | `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/` | `BASE` |
| `ruvector` | (bundled) | `~/.npm/_npx/*/node_modules/ruvector/bin/cli.js` | `RUVECTOR_CLI` |
| `ruv-swarm` | `1.0.20` | `~/.npm/_npx/*/node_modules/ruv-swarm/` | (found via glob) |

`BASE` is set by `patch-all.sh`. All path variables in `lib/common.py` derive from it.
`RUVECTOR_CLI` is set by `patch-all.sh` to the ruvector CLI entry point.
RS-001 locates its own target via `find`.

### Dependency Order

These patches must be applied in sequence (enforced by `patch-all.sh`):

1. NS-001 (discovery defaults) -> NS-002 (namespace enforcement) -> NS-003 (typo fix)

All other patches are independent.

### Key Design Decisions

- **Idempotent**: `patch()` checks if `new` string is already present before replacing.
- **Non-destructive**: patches only modify the npx cache, never the npm registry package.
- **Platform-aware**: DM-003 is macOS-only (auto-skipped on Linux).
- **Sentinel-guarded**: `check-patches.sh` detects cache wipes and auto-reapplies.

### Repository Structure

```
claude-flow-patch/
  README.md              # This file
  CLAUDE.md              # Claude Code instructions (defect workflow, policies)
  AGENTS.md              # Codex agent configuration
  patch-all.sh           # Apply all patches (entry point)
  check-patches.sh       # Sentinel: verify + auto-reapply
  repair-post-init.sh    # Post-init helper repair
  lib/
    common.py            # Shared patch()/patch_all() helpers + path variables
  patch/
    {PREFIX}-{NNN}-{slug}/
      README.md          # Defect report: title, severity, root cause, fix
      fix.py             # Idempotent patch script
      fix.sh             # Shell-based patch script (EM-002 only)
    (29 defect directories total)
```

## Defect Index

29 defects across 13 categories.

### HW -- Headless Worker Execution

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [HW&#8209;001](patch/HW-001-stdin-hang/) | Spawned headless workers hang indefinitely waiting for input that never arrives | Critical | [#1111](https://github.com/ruvnet/claude-flow/issues/1111) |
| [HW&#8209;002](patch/HW-002-failures-swallowed/) | Worker failures are silently reported as success, hiding errors from the caller | High | [#1112](https://github.com/ruvnet/claude-flow/issues/1112) |
| [HW&#8209;003](patch/HW-003-aggressive-intervals/) | Worker scheduling fires too frequently, wasting CPU on idle polling | High | [#1113](https://github.com/ruvnet/claude-flow/issues/1113) |

### DM -- Daemon & Workers

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [DM&#8209;001](patch/DM-001-daemon-log-zero/) | daemon.log is always 0 bytes -- no daemon output is ever persisted | Medium | [#1116](https://github.com/ruvnet/claude-flow/issues/1116) |
| [DM&#8209;002](patch/DM-002-cpu-load-threshold/) | Default maxCpuLoad of 2.0 blocks all workers on multi-core machines | Critical | [#1138](https://github.com/ruvnet/claude-flow/issues/1138) |
| [DM&#8209;003](patch/DM-003-macos-freemem/) | macOS `freemem()` reports ~0% available, blocking all worker scheduling | Critical | [#1077](https://github.com/ruvnet/claude-flow/issues/1077) |
| [DM&#8209;004](patch/DM-004-preload-worker-stub/) | Preload worker is referenced but has no implementation and is missing from defaults | Enhancement | [#1139](https://github.com/ruvnet/claude-flow/issues/1139) |
| [DM&#8209;005](patch/DM-005-consolidation-worker-stub/) | Consolidation worker has no decay or rebuild logic | Enhancement | [#1140](https://github.com/ruvnet/claude-flow/issues/1140) |

### CF -- Config & Doctor

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [CF&#8209;001](patch/CF-001-doctor-yaml/) | `doctor` command only checks for JSON config, ignoring YAML config files | Low | [#1141](https://github.com/ruvnet/claude-flow/issues/1141) |
| [CF&#8209;002](patch/CF-002-config-export-yaml/) | `config export` outputs hardcoded defaults instead of the actual project config | Medium | [#1142](https://github.com/ruvnet/claude-flow/issues/1142) |

### EM -- Embeddings & HNSW Init

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [EM&#8209;001](patch/EM-001-embedding-ignores-config/) | Embedding system ignores project config for model name and HNSW dimensions | High | [#1143](https://github.com/ruvnet/claude-flow/issues/1143) |
| [EM&#8209;002](patch/EM-002-transformers-cache-eacces/) | `@xenova/transformers` cache directory has wrong permissions (EACCES) | Medium | [#1144](https://github.com/ruvnet/claude-flow/issues/1144) |

### UI -- Display & Cosmetic

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [UI&#8209;001](patch/UI-001-intelligence-stats-crash/) | `hooks intelligence stats` crashes on `.toFixed()` of undefined SONA/MoE/embeddings fields | Critical | [#1145](https://github.com/ruvnet/claude-flow/issues/1145) |
| [UI&#8209;002](patch/UI-002-neural-status-not-loaded/) | `neural status` always shows "Not loaded" even when neural patterns exist | Low | [#1146](https://github.com/ruvnet/claude-flow/issues/1146) |

### NS -- Memory Namespace

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [NS&#8209;001](patch/NS-001-discovery-default-namespace/) | Search and list operations default to `'default'` namespace, missing entries in other namespaces | Critical | [#1123](https://github.com/ruvnet/claude-flow/issues/1123) |
| [NS&#8209;002](patch/NS-002-targeted-require-namespace/) | Store, delete, and retrieve silently fall back to `'default'` and accept `'all'` as a namespace | Critical | [#581](https://github.com/ruvnet/claude-flow/issues/581) |
| [NS&#8209;003](patch/NS-003-namespace-typo-pattern/) | Hardcoded namespace string `'pattern'` vs actual namespace `'patterns'` | Medium | [#1136](https://github.com/ruvnet/claude-flow/issues/1136) |

### GV -- Ghost Vectors

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [GV&#8209;001](patch/GV-001-hnsw-ghost-vectors/) | Deleting a memory entry leaves orphaned vectors in the HNSW index | Medium | [#1122](https://github.com/ruvnet/claude-flow/issues/1122) |

### IN -- Intelligence

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [IN&#8209;001](patch/IN-001-intelligence-stub/) | `init` generates 197-line intelligence stub instead of full 916-line version when source dir not found | High | [#1154](https://github.com/ruvnet/claude-flow/issues/1154) |

### SG -- Settings Generator

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [SG&#8209;001](patch/SG-001-init-settings/) | Init generates invalid hooks and permission patterns | High | [#1150](https://github.com/ruvnet/claude-flow/issues/1150) |
| [SG&#8209;002](patch/SG-002-helpers-compat-copies/) | Init doesn't create .js/.cjs compat copies for helper modules | High | [#1153](https://github.com/ruvnet/claude-flow/issues/1153) |

### MM -- Memory Management

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [MM&#8209;001](patch/MM-001-memory-persist-path/) | memory-initializer.js ignores persistPath config, hardcodes .swarm/ | Medium | [#1152](https://github.com/ruvnet/claude-flow/issues/1152) |

### HK -- Hooks

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [HK&#8209;001](patch/HK-001-post-edit-file-path/) | post-edit hook records file_path as "unknown" -- reads env var instead of stdin JSON | Medium | [#1155](https://github.com/ruvnet/claude-flow/issues/1155) |
| [HK&#8209;002](patch/HK-002-hooks-tools-stub/) | MCP hook handlers (postEdit, postCommand, postTask) return fake data without persisting | High | [#1058](https://github.com/ruvnet/claude-flow/issues/1058) |
| [HK&#8209;003](patch/HK-003-metrics-hardcoded/) | `hooks_metrics` MCP handler returns hardcoded fake data instead of reading persisted metrics | High | [#1158](https://github.com/ruvnet/claude-flow/issues/1158) |

### RV -- RuVector Intelligence

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RV&#8209;001](patch/RV-001-force-learn-tick/) | `force-learn` command crashes -- calls `intel.tick()` which doesn't exist on the Intelligence class | Medium | [#1156](https://github.com/ruvnet/claude-flow/issues/1156) |
| [RV&#8209;002](patch/RV-002-trajectory-load/) | `activeTrajectories` not loaded from file -- `trajectory-step`/`trajectory-end` fail with "No active trajectory" | High | [#1157](https://github.com/ruvnet/claude-flow/issues/1157) |
| [RV&#8209;003](patch/RV-003-trajectory-stats-sync/) | `trajectory-end` does not update `stats` counters -- `hooks stats` reports zeros despite real data | Medium | [ruv-FANN#186](https://github.com/ruvnet/ruv-FANN/issues/186) |

### RS -- ruv-swarm

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RS&#8209;001](patch/RS-001-better-sqlite3-node24/) | `better-sqlite3@^11.6.0` lacks Node 24 prebuilt binaries -- MCP server crashes on startup | Critical | [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185) |

## Init-Script Patches (Local Project Action Required)

Five patches target the **init/generator scripts** (`executor.js`, `settings-generator.js`, `helpers-generator.js`). These fix the code that *generates* your `.claude/` project files -- but applying patches does **not** update files already generated in your project. You must take one additional step.

### Affected Defects

| ID | Generator patched | Local file affected | Problem if not refreshed |
|----|-------------------|---------------------|--------------------------|
| IN-001 | `init/executor.js` | `.claude/helpers/intelligence.cjs` | 197-line stub: no PageRank, no graph, `feedback()` is a no-op, no learning |
| HK-001 | `init/helpers-generator.js` | `.claude/helpers/hook-handler.cjs` | Reads env vars instead of stdin JSON; post-edit logs `file: "unknown"` |
| SG-001 | `init/settings-generator.js` | `.claude/settings.json` | May contain invalid hook events, broad permissions, relative paths |
| SG-002 | `init/executor.js` | `.claude/helpers/*.js` / `*.cjs` | Missing .js/.cjs compat copies; `hook-handler.cjs` require() calls fail silently |
| MM-001 | `init/executor.js` | `.claude-flow/config.yaml` | Misleading `persistPath` setting that nothing reads |

### How to Fix

**Option A: Run `repair`** (recommended)

```bash
npx --yes claude-flow-patch --scope both
npx --yes claude-flow-patch repair --target .
npx --yes claude-flow-patch apply SG-002       # apply a single patch
```

This copies patched helper files into your project and creates any missing .js/.cjs compat copies.

**Option B: Copy full helpers from the package manually**

```bash
npx --yes claude-flow-patch --scope both
SRC=$(find ~/.npm/_npx -path '*/@claude-flow/cli/.claude/helpers' -type d 2>/dev/null | head -1)
for f in intelligence.cjs hook-handler.cjs session.js learning-service.mjs metrics-db.mjs statusline.cjs; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" .claude/helpers/ && echo "Copied: $f"
done
```

**Option C: Re-run init upgrade** (regenerates from patched scripts)

```bash
npx --yes claude-flow-patch --scope both
npx @claude-flow/cli@latest init upgrade --force
```

Caution: Option C may overwrite other customizations in `.claude/`.

### Why This Happens

These patches fix the **generator functions** inside the npm package (e.g., `generateIntelligenceStub()` in `executor.js`). When the generator runs via `claude-flow init`, it produces the project files in `.claude/helpers/`. If your project was initialized *before* patches were applied, the stubs are already on disk. Patches only modify the npm package source -- they do not touch files already generated in your project.

Additionally, `init upgrade` only force-overwrites 3 "critical" helpers (`auto-memory-hook.mjs`, `hook-handler.cjs`, `intelligence.cjs`). The other 30+ helper files (shell scripts for daemon management, health monitoring, security scanning, swarm hooks, etc.) are only copied on fresh `init`, not on upgrade. If these are missing, use Option A above.

## Compatibility

- Tested against `@claude-flow/cli@3.1.0-alpha.41` and `ruv-swarm@1.0.20`
- Requires Python 3.6+ and Bash
- Works on Linux and macOS (DM-003 is macOS-only, auto-skipped on Linux)

## Links

- Homepage: https://sparklingideas.co.uk/claude-flow/patch
- Package: https://www.npmjs.com/package/claude-flow-patch
- GitHub: https://github.com/sparkling/claude-flow-patch
- Issues: https://github.com/sparkling/claude-flow-patch/issues

## License

MIT
