# @sparkleideas/claude-flow-patch

## Contents

- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [How It Works](#how-it-works)
  - [Sentinel Files](#sentinel-files)
  - [Target Packages](#target-packages)
  - [Dependency Order](#dependency-order)
  - [Key Design Decisions](#key-design-decisions)
  - [Repository Structure](#repository-structure)
- [Defect Index](#defect-index)
- [Init-Script Patches](#init-script-patches)
- [Auto-Reapply on Update](#auto-reapply-on-update)
- [Compatibility](#compatibility)
- [Links](#links)

---

Community patches for [`@claude-flow/cli`](https://www.npmjs.com/package/@claude-flow/cli) **v3.1.0-alpha.41**, [`ruvector`](https://www.npmjs.com/package/ruvector), and [`ruv-swarm`](https://www.npmjs.com/package/ruv-swarm) **v1.0.20**.

These patches fix 29 defects across 13 categories. They are applied at runtime via idempotent Python scripts that perform targeted string replacements on the npx-cached source files.

<a id="quick-start"></a>

## Quick Start

**Patch before init.** Several patches fix the init/generator scripts. If you run `claude-flow init` before patching, the generated `.claude/helpers/` files will be stubs with no learning, no PageRank, and no-op feedback. Always patch first:

```bash
# 1. Patch first -- fixes the init generators
npx --yes @sparkleideas/claude-flow-patch --global

# 2. Then init (or re-init if already initialized)
npx @claude-flow/cli@latest init            # fresh project
npx @claude-flow/cli@latest init upgrade    # existing project

# 3. Verify
npx --yes @sparkleideas/claude-flow-patch check
```

If you already initialized before patching:

```bash
npx --yes @sparkleideas/claude-flow-patch repair --target /path/to/project
```

### Target Options

```bash
npx --yes @sparkleideas/claude-flow-patch                                  # global npx cache (default)
npx --yes @sparkleideas/claude-flow-patch --global                         # explicit global
npx --yes @sparkleideas/claude-flow-patch --target ~/my-project            # project's node_modules
npx --yes @sparkleideas/claude-flow-patch --global --target ~/my-project   # both
```

`npx @claude-flow/cli` uses local `node_modules` if present, otherwise the global npx cache. Use `--target` to patch a project's local install.

<a id="cli-commands"></a>

## CLI Commands

| Command | Purpose |
|---|---|
| `claude-flow-patch [--global] [--target <dir>]` | Apply all patches (default: `--global`) |
| `claude-flow-patch apply <ID>` | Apply a single patch by defect ID (e.g. `SG-002`) |
| `claude-flow-patch check` | Verify patch sentinels and auto-detect drift |
| `claude-flow-patch repair --target <dir> [--source auto\|local\|global] [--dry-run]` | Rehydrate `.claude/helpers` in projects initialized before patching |

<a id="how-it-works"></a>

## How It Works

1. `patch-all.sh` locates the `@claude-flow/cli` dist files in the npm/npx cache
2. Globs `patch/*/fix.py` (numeric prefixes on directories ensure correct execution order)
3. Concatenates `lib/common.py` with each `fix.py` and runs as a single Python process
4. Each patch is idempotent: skips if already applied, warns if source changed

The `check-patches.sh` sentinel runs on session start to detect npx cache wipes and auto-reapply. It reads `sentinel` files from each patch directory — no hardcoded patch list.

<a id="sentinel-files"></a>

### Sentinel Files

Each patch directory contains a `sentinel` file that declares how to verify the patch is applied:

```
grep "pattern to find" relative/path/to/file.js
absent "pattern that should NOT exist" relative/path.js
none
package: ruvector
```

| Directive | Meaning |
|-----------|---------|
| `grep "..." file` | Pass if pattern is found in file (standard check) |
| `absent "..." file` | Pass if pattern is **not** found (removal check) |
| `none` | No sentinel — skip verification |
| `package: X` | Target package (default: `@claude-flow/cli`). Skipped if package not installed |

`check-patches.sh` and `lib/discover.mjs` both read these files dynamically. Adding a new patch requires no edits to any script — just create the `sentinel` file in the new patch directory.

<a id="target-packages"></a>

### Target Packages

| Package | Version | Location | Env var |
|---------|---------|----------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.41` | `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/` | `BASE` |
| `ruvector` | (bundled) | `~/.npm/_npx/*/node_modules/ruvector/bin/cli.js` | `RUVECTOR_CLI` |
| `ruv-swarm` | `1.0.20` | `~/.npm/_npx/*/node_modules/ruv-swarm/` | (found via glob) |

`BASE` is set by `patch-all.sh`. All path variables in `lib/common.py` derive from it.
`RUVECTOR_CLI` is set by `patch-all.sh` to the ruvector CLI entry point.
RS-001 locates its own target via `find`.

<a id="dependency-order"></a>

### Dependency Order

Execution order is controlled by 3-digit numeric prefixes on directory names (e.g. `010-CF-001-*`,
`170-IN-001-*`). `patch-all.sh` globs `patch/*/fix.py`, which sorts lexicographically — numeric
prefixes guarantee correct order.

Two dependency chains exist:

| Chain | Directories | Reason |
|-------|-------------|--------|
| IN-001 -> SG-003 | `170-IN-001-*` before `270-SG-003-*` | SG-003's patch targets code introduced by IN-001 |
| NS-001 -> NS-002 -> NS-003 | `190-NS-001-*` before `200-NS-002-*` before `210-NS-003-*` | Sequential namespace fixes |

All other patches are independent.

<a id="key-design-decisions"></a>

### Key Design Decisions

- **Zero-maintenance discovery**: `patch-all.sh`, `check-patches.sh`, and doc generation all discover patches dynamically — no hardcoded lists.
- **Idempotent**: `patch()` checks if `new` string is already present before replacing.
- **Non-destructive**: patches only modify the npx cache, never the npm registry package.
- **Platform-aware**: DM-003 is macOS-only (auto-skipped on Linux).
- **Sentinel-guarded**: `check-patches.sh` reads `sentinel` files from each patch directory to detect cache wipes and auto-reapply.

<a id="repository-structure"></a>

### Repository Structure

```
claude-flow-patch/
  README.md              # This file
  CLAUDE.md              # Claude Code instructions (defect workflow, policies)
  AGENTS.md              # Codex agent configuration
  patch-all.sh           # Apply all patches (globs patch/*/fix.py dynamically)
  check-patches.sh       # Sentinel: reads patch/*/sentinel files dynamically
  repair-post-init.sh    # Post-init helper repair
  lib/
    common.py            # Shared patch()/patch_all() helpers + path variables
    discover.mjs         # Dynamic patch discovery — single source of truth
    categories.json      # Prefix-to-label mapping (e.g. HW → Headless Worker)
  scripts/
    preflight.mjs        # Pre-commit sync: doc tables, versions, config
  patch/
    {NNN}-{PREFIX}-{NNN}-{slug}/    # NNN = 3-digit execution order
      README.md          # Defect report: title, severity, root cause, fix
      fix.py             # Idempotent patch script
      fix.sh             # Shell-based patch script (EM-002 only)
      sentinel           # Verification directives for check-patches.sh
    (29 defect directories total)
```

<a id="defect-index"></a>

## Defect Index

<!-- GENERATED:defect-index:begin -->
47 defects across 14 categories.

### CF -- Config & Doctor

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [CF&#8209;001](patch/010-CF-001-doctor-yaml/) | Doctor ignores YAML config files | Low | [#1141](https://github.com/ruvnet/claude-flow/issues/1141) |
| [CF&#8209;002](patch/020-CF-002-config-export-yaml/) | Config export shows hardcoded defaults | Medium | [#1142](https://github.com/ruvnet/claude-flow/issues/1142) |
| [CF&#8209;003](patch/380-CF-003-doctor-native-deps/) | Doctor --install native dependency resolution | Medium | [#1186](https://github.com/ruvnet/claude-flow/issues/1186) |
| [CF&#8209;004](patch/420-CF-004-config-export-json/) | config get/export uses hand-rolled YAML parser instead of config.json | Medium | [#1193](https://github.com/ruvnet/claude-flow/issues/1193) |
| [CF&#8209;005](patch/430-CF-005-doctor-config-json/) | Doctor checkMemoryBackend reads env var + config.yaml instead of config.json | Medium | [#1194](https://github.com/ruvnet/claude-flow/issues/1194) |

### DM -- Daemon & Workers

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [DM&#8209;001](patch/030-DM-001-daemon-log-zero/) | daemon.log always 0 bytes | Medium | [#1116](https://github.com/ruvnet/claude-flow/issues/1116) |
| [DM&#8209;002](patch/040-DM-002-cpu-load-threshold/) | maxCpuLoad=2.0 blocks all workers on multi-core | Critical | [#1138](https://github.com/ruvnet/claude-flow/issues/1138) |
| [DM&#8209;003](patch/050-DM-003-macos-freemem/) | macOS freemem() always ~0% — workers blocked | Critical | [#1077](https://github.com/ruvnet/claude-flow/issues/1077) |
| [DM&#8209;004](patch/060-DM-004-preload-worker-stub/) | Preload worker stub + missing from defaults | Enhancement | [#1139](https://github.com/ruvnet/claude-flow/issues/1139) |
| [DM&#8209;005](patch/070-DM-005-consolidation-worker-stub/) | Consolidation worker stub (no decay/rebuild) | Enhancement | [#1140](https://github.com/ruvnet/claude-flow/issues/1140) |
| [DM&#8209;006](patch/300-DM-006-log-rotation/) | No log rotation — logs grow unbounded | Medium | [#1114](https://github.com/ruvnet/claude-flow/issues/1114) |

### EM -- Embeddings & HNSW

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [EM&#8209;001](patch/080-EM-001-embedding-ignores-config/) | Embedding system ignores project config (model + HNSW dims) | High | [#1143](https://github.com/ruvnet/claude-flow/issues/1143) |
| [EM&#8209;002](patch/090-EM-002-transformers-cache-eacces/) | @xenova/transformers cache EACCES | Medium | [#1144](https://github.com/ruvnet/claude-flow/issues/1144) |

### GV -- Ghost Vectors

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [GV&#8209;001](patch/100-GV-001-hnsw-ghost-vectors/) | HNSW ghost vectors persist after memory delete | Medium | [#1122](https://github.com/ruvnet/claude-flow/issues/1122) |

### HK -- Hooks

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [HK&#8209;001](patch/110-HK-001-post-edit-file-path/) | post-edit hook records file_path as "unknown" | Medium | [#1155](https://github.com/ruvnet/claude-flow/issues/1155) |
| [HK&#8209;002](patch/120-HK-002-hooks-tools-stub/) | MCP hook handlers are stubs that don't persist data | High | [#1058](https://github.com/ruvnet/claude-flow/issues/1058) |
| [HK&#8209;003](patch/130-HK-003-metrics-hardcoded/) | hooks_metrics MCP handler returns hardcoded fake data | High | [#1158](https://github.com/ruvnet/claude-flow/issues/1158) |
| [HK&#8209;004](patch/135-HK-004-respect-daemon-autostart/) | hooks_session-start ignores daemon.autoStart from settings.json | High | [#1175](https://github.com/ruvnet/claude-flow/issues/1175) |
| [HK&#8209;005](patch/137-HK-005-daemon-pid-guard/) | Multiple MCP servers start independent in-process daemons | Critical | [#1171](https://github.com/ruvnet/claude-flow/issues/1171) |

### HW -- Headless Worker

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [HW&#8209;001](patch/140-HW-001-stdin-hang/) | Headless workers hang — stdin pipe never closed | Critical | [#1111](https://github.com/ruvnet/claude-flow/issues/1111) |
| [HW&#8209;002](patch/150-HW-002-failures-swallowed/) | Headless failures silently swallowed as success | High | [#1112](https://github.com/ruvnet/claude-flow/issues/1112) |
| [HW&#8209;003](patch/160-HW-003-aggressive-intervals/) | Worker scheduling intervals too aggressive + settings ignored | High | [#1113](https://github.com/ruvnet/claude-flow/issues/1113) |
| [HW&#8209;004](patch/310-HW-004-runwithtimeout-orphan/) | runWithTimeout rejects but does not kill child process | Medium | [#1117](https://github.com/ruvnet/claude-flow/issues/1117) |

### IN -- Intelligence

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [IN&#8209;001](patch/170-IN-001-intelligence-stub/) | intelligence.cjs is a stub that doesn't actually learn | Critical | [#1154](https://github.com/ruvnet/claude-flow/issues/1154) |

### MM -- Memory Management

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [MM&#8209;001](patch/180-MM-001-memory-persist-path/) | Remove dead persistPath config option | Low | [#1152](https://github.com/ruvnet/claude-flow/issues/1152) |

### NS -- Memory Namespace

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [NS&#8209;001](patch/190-NS-001-discovery-default-namespace/) | Discovery ops default to wrong namespace | Critical | [#1123](https://github.com/ruvnet/claude-flow/issues/1123) |
| [NS&#8209;002](patch/200-NS-002-targeted-require-namespace/) | Store/delete/retrieve fall back to 'default' + accept 'all' | Critical | [#581](https://github.com/ruvnet/claude-flow/issues/581) |
| [NS&#8209;003](patch/210-NS-003-namespace-typo-pattern/) | Namespace typo 'pattern' vs 'patterns' | Medium | [#1136](https://github.com/ruvnet/claude-flow/issues/1136) |

### RS -- ruv-swarm

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RS&#8209;001](patch/220-RS-001-better-sqlite3-node24/) | ruv-swarm MCP fails on Node 24 — better-sqlite3 missing native bindings | Critical | [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185) |

### RV -- RuVector Intelligence

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RV&#8209;001](patch/230-RV-001-force-learn-tick/) | force-learn command calls intel.tick() which doesn't exist | Medium | [#1156](https://github.com/ruvnet/claude-flow/issues/1156) |
| [RV&#8209;002](patch/240-RV-002-trajectory-load/) | activeTrajectories not loaded from saved file | High | [#1157](https://github.com/ruvnet/claude-flow/issues/1157) |
| [RV&#8209;003](patch/250-RV-003-trajectory-stats-sync/) | trajectory-end does not update stats counters | Medium | [ruv-FANN#186](https://github.com/ruvnet/ruv-FANN/issues/186) |

### SG -- Settings Generator

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [SG&#8209;001](patch/260-SG-001-init-settings/) | Init generates invalid settings | High | [#1150](https://github.com/ruvnet/claude-flow/issues/1150) |
| [SG&#8209;003](patch/270-SG-003-init-helpers-all-paths/) | Init missing helpers for --dual, --minimal, hooks, and upgrade paths | Critical | [#1169](https://github.com/ruvnet/claude-flow/issues/1169) |
| [SG&#8209;004](patch/320-SG-004-wizard-parity/) | init wizard lacks parity with init | High | [#1181](https://github.com/ruvnet/claude-flow/issues/1181) |
| [SG&#8209;005](patch/330-SG-005-start-all-subcommand/) | add 'start all' subcommand to start everything at once | Enhancement | [#1177](https://github.com/ruvnet/claude-flow/issues/1177) |
| [SG&#8209;006](patch/340-SG-006-wizard-capture/) | Wizard captures permissionRequest hook but never assigns it + topology hardcoded | Medium | [#1184](https://github.com/ruvnet/claude-flow/issues/1184) |
| [SG&#8209;007](patch/385-SG-007-init-shallow-copy/) | --skip-claude / --only-claude mutate shared init options via shallow copy | Medium | [#1188](https://github.com/ruvnet/claude-flow/issues/1188) |
| [SG&#8209;008](patch/440-SG-008-init-config-json/) | init should generate .claude-flow/config.json | Enhancement | [#1195](https://github.com/ruvnet/claude-flow/issues/1195) |

### UI -- Display & Cosmetic

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [UI&#8209;001](patch/280-UI-001-intelligence-stats-crash/) | intelligence stats crashes on .toFixed() | Critical | [#1145](https://github.com/ruvnet/claude-flow/issues/1145) |
| [UI&#8209;002](patch/290-UI-002-neural-status-not-loaded/) | neural status shows "Not loaded" | Low | [#1146](https://github.com/ruvnet/claude-flow/issues/1146) |

### WM -- Wiring / Memory Integration

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [WM&#8209;001](patch/350-WM-001-memory-wiring/) | Wire @claude-flow/memory HybridBackend into CLI | Critical | [#829](https://github.com/ruvnet/claude-flow/issues/829) |
| [WM&#8209;002](patch/360-WM-002-config-respect/) | Neural config gating (neural.enabled not consumed at runtime) | Medium | [#1185](https://github.com/ruvnet/claude-flow/issues/1185) |
| [WM&#8209;003](patch/370-WM-003-auto-memory-bridge/) | Activate AutoMemoryBridge in auto-memory-hook.mjs | High | [#1102](https://github.com/ruvnet/claude-flow/issues/1102) |
| [WM&#8209;004](patch/390-WM-004-source-hook-fail-loud/) | Source hook silently falls back to JsonFileBackend | High | [#1190](https://github.com/ruvnet/claude-flow/issues/1190) |
| [WM&#8209;005](patch/400-WM-005-memory-init-config-json/) | memory-initializer reads config.yaml with hand-rolled regex instead of config.json | Medium | [#1191](https://github.com/ruvnet/claude-flow/issues/1191) |
| [WM&#8209;006](patch/410-WM-006-neural-config-json/) | intelligence.js reads neural.enabled from config.yaml regex instead of config.json | Medium | [#1192](https://github.com/ruvnet/claude-flow/issues/1192) |
<!-- GENERATED:defect-index:end -->

<a id="init-script-patches"></a>

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
npx --yes @sparkleideas/claude-flow-patch --global
npx --yes @sparkleideas/claude-flow-patch repair --target .
npx --yes @sparkleideas/claude-flow-patch apply SG-002       # apply a single patch
```

This copies patched helper files into your project and creates any missing .js/.cjs compat copies.

**Option B: Copy full helpers from the package manually**

```bash
npx --yes @sparkleideas/claude-flow-patch --global
SRC=$(find ~/.npm/_npx -path '*/@claude-flow/cli/.claude/helpers' -type d 2>/dev/null | head -1)
for f in intelligence.cjs hook-handler.cjs session.js learning-service.mjs metrics-db.mjs statusline.cjs; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" .claude/helpers/ && echo "Copied: $f"
done
```

**Option C: Re-run init upgrade** (regenerates from patched scripts)

```bash
npx --yes @sparkleideas/claude-flow-patch --global
npx @claude-flow/cli@latest init upgrade --force
```

Caution: Option C may overwrite other customizations in `.claude/`.

### Why This Happens

These patches fix the **generator functions** inside the npm package (e.g., `generateIntelligenceStub()` in `executor.js`). When the generator runs via `claude-flow init`, it produces the project files in `.claude/helpers/`. If your project was initialized *before* patches were applied, the stubs are already on disk. Patches only modify the npm package source -- they do not touch files already generated in your project.

Additionally, `init upgrade` only force-overwrites 3 "critical" helpers (`auto-memory-hook.mjs`, `hook-handler.cjs`, `intelligence.cjs`). The other 30+ helper files (shell scripts for daemon management, health monitoring, security scanning, swarm hooks, etc.) are only copied on fresh `init`, not on upgrade. If these are missing, use Option A above.

<a id="auto-reapply-on-update"></a>

## Auto-Reapply on Update

When `npx` fetches a new version of `@claude-flow/cli`, `ruvector`, or `ruv-swarm`, it replaces the cached files and wipes all patches. Use one of these approaches to detect this and auto-reapply.

### Option A: Claude Code Hook (Recommended for AI Agents)

Add a `session_start` hook to your project's `.claude/settings.json`. This runs `check-patches.sh` every time Claude starts a session — it detects missing patches and reapplies automatically:

```jsonc
// .claude/settings.json
{
  "hooks": {
    "session_start": [
      {
        "command": "bash /path/to/claude-flow-patch/check-patches.sh --global",
        "timeout": 30000
      }
    ]
  }
}
```

Replace `/path/to/claude-flow-patch` with the absolute path to your clone. If your project also has a local install, use `--global --target .` instead.

`check-patches.sh` is fast and idempotent — if patches are intact it prints `OK` and exits. If any sentinel fails, it runs `patch-all.sh`, restarts the daemon, and reports what happened.

### Option B: Cron / systemd Timer

Poll every 5 minutes with cron:

```bash
# crontab -e
*/5 * * * * bash /path/to/claude-flow-patch/check-patches.sh --global >> /tmp/patch-sentinel.log 2>&1
```

Or with a systemd user timer:

```ini
# ~/.config/systemd/user/patch-sentinel.timer
[Timer]
OnBootSec=60
OnUnitActiveSec=300

[Install]
WantedBy=timers.target
```

```ini
# ~/.config/systemd/user/patch-sentinel.service
[Service]
Type=oneshot
ExecStart=/bin/bash /path/to/claude-flow-patch/check-patches.sh --global
```

```bash
systemctl --user enable --now patch-sentinel.timer
```

### Option C: npm postinstall Hook

If you install `@claude-flow/cli` as a project dependency, add a postinstall script that reapplies patches whenever `npm install` refreshes it:

```jsonc
// package.json
{
  "scripts": {
    "postinstall": "npx --yes @sparkleideas/claude-flow-patch --target ."
  }
}
```

### How the Sentinel Works

`check-patches.sh` reads the `sentinel` file in each `patch/*/` directory and checks whether the patched strings are present in the target files. If any check fails:

1. Prints a warning identifying the likely cause (npx cache update)
2. Runs `patch-all.sh` to reapply all patches
3. Stops and restarts the claude-flow daemon so it picks up the patched code

The entire check takes under 2 seconds when patches are intact. Reapplication takes 5-10 seconds.

<a id="compatibility"></a>

## Compatibility

- Tested against `@claude-flow/cli@3.1.0-alpha.41` and `ruv-swarm@1.0.20`
- Requires Python 3.6+ and Bash
- Works on Linux and macOS (DM-003 is macOS-only, auto-skipped on Linux)

<a id="links"></a>

## Links

- Homepage: https://sparklingideas.co.uk/claude-flow/patch
- Package: https://www.npmjs.com/package/@sparkleideas/claude-flow-patch
- GitHub: https://github.com/sparkling/claude-flow-patch
- Issues: https://github.com/sparkling/claude-flow-patch/issues

## License

MIT
