# @sparkleideas/claude-flow-patch

Patch toolkit for `@claude-flow/cli` runtime and init-script defects.

This package applies verified, idempotent patches to your local CLI source in the npm cache or local `node_modules`, then verifies sentinels and can repair projects initialized before patching.

## What This Solves

`claude-flow init` can generate incomplete or broken project helpers when upstream defects are present. This toolkit addresses known defects in:

- `@claude-flow/cli`
- `ruvector`
- `ruv-swarm`

<!-- GENERATED:npm-defects:begin -->
50 tracked defects across 14 categories.

| Defect | Description | GitHub Issue |
|--------|-------------|-------------|
| [CF-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/010-CF-001-doctor-yaml) | Doctor ignores YAML config files | [#1141](https://github.com/ruvnet/claude-flow/issues/1141) |
| [CF-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/020-CF-002-config-export-yaml) | Config export shows hardcoded defaults | [#1142](https://github.com/ruvnet/claude-flow/issues/1142) |
| [CF-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/380-CF-003-doctor-native-deps) | Doctor --install native dependency resolution | [#1186](https://github.com/ruvnet/claude-flow/issues/1186) |
| [CF-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/420-CF-004-config-export-json) | config get/export uses hand-rolled YAML parser instead of config.json | [#1193](https://github.com/ruvnet/claude-flow/issues/1193) |
| [CF-005](https://github.com/sparkling/claude-flow-patch/tree/master/patch/430-CF-005-doctor-config-json) | Doctor checkMemoryBackend reads env var + config.yaml instead of config.json | [#1194](https://github.com/ruvnet/claude-flow/issues/1194) |
| [CF-006](https://github.com/sparkling/claude-flow-patch/tree/master/patch/450-CF-006-start-config-json) | start.js uses hand-rolled YAML parser instead of config.json | [#1197](https://github.com/ruvnet/claude-flow/issues/1197) |
| [CF-007](https://github.com/sparkling/claude-flow-patch/tree/master/patch/460-CF-007-status-config-json) | status.js isInitialized checks config.yaml instead of config.json | [#1198](https://github.com/ruvnet/claude-flow/issues/1198) |
| [CF-008](https://github.com/sparkling/claude-flow-patch/tree/master/patch/470-CF-008-init-display-config-json) | init.js isInitialized and display strings reference config.yaml | [#1199](https://github.com/ruvnet/claude-flow/issues/1199) |
| [DM-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/030-DM-001-daemon-log-zero) | daemon.log always 0 bytes | [#1116](https://github.com/ruvnet/claude-flow/issues/1116) |
| [DM-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/040-DM-002-cpu-load-threshold) | maxCpuLoad=2.0 blocks all workers on multi-core | [#1138](https://github.com/ruvnet/claude-flow/issues/1138) |
| [DM-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/050-DM-003-macos-freemem) | macOS freemem() always ~0% — workers blocked | [#1077](https://github.com/ruvnet/claude-flow/issues/1077) |
| [DM-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/060-DM-004-preload-worker-stub) | Preload worker stub + missing from defaults | [#1139](https://github.com/ruvnet/claude-flow/issues/1139) |
| [DM-005](https://github.com/sparkling/claude-flow-patch/tree/master/patch/070-DM-005-consolidation-worker-stub) | Consolidation worker stub (no decay/rebuild) | [#1140](https://github.com/ruvnet/claude-flow/issues/1140) |
| [DM-006](https://github.com/sparkling/claude-flow-patch/tree/master/patch/300-DM-006-log-rotation) | No log rotation — logs grow unbounded | [#1114](https://github.com/ruvnet/claude-flow/issues/1114) |
| [EM-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/080-EM-001-embedding-ignores-config) | Embedding system ignores project config (model + HNSW dims) | [#1143](https://github.com/ruvnet/claude-flow/issues/1143) |
| [EM-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/090-EM-002-transformers-cache-eacces) | @xenova/transformers cache EACCES | [#1144](https://github.com/ruvnet/claude-flow/issues/1144) |
| [GV-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/100-GV-001-hnsw-ghost-vectors) | HNSW ghost vectors persist after memory delete | [#1122](https://github.com/ruvnet/claude-flow/issues/1122) |
| [HK-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/110-HK-001-post-edit-file-path) | post-edit hook records file_path as "unknown" | [#1155](https://github.com/ruvnet/claude-flow/issues/1155) |
| [HK-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/120-HK-002-hooks-tools-stub) | MCP hook handlers are stubs that don't persist data | [#1058](https://github.com/ruvnet/claude-flow/issues/1058) |
| [HK-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/130-HK-003-metrics-hardcoded) | hooks_metrics MCP handler returns hardcoded fake data | [#1158](https://github.com/ruvnet/claude-flow/issues/1158) |
| [HK-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/135-HK-004-respect-daemon-autostart) | hooks_session-start ignores daemon.autoStart from settings.json | [#1175](https://github.com/ruvnet/claude-flow/issues/1175) |
| [HK-005](https://github.com/sparkling/claude-flow-patch/tree/master/patch/137-HK-005-daemon-pid-guard) | Multiple MCP servers start independent in-process daemons | [#1171](https://github.com/ruvnet/claude-flow/issues/1171) |
| [HW-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/140-HW-001-stdin-hang) | Headless workers hang — stdin pipe never closed | [#1111](https://github.com/ruvnet/claude-flow/issues/1111) |
| [HW-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/150-HW-002-failures-swallowed) | Headless failures silently swallowed as success | [#1112](https://github.com/ruvnet/claude-flow/issues/1112) |
| [HW-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/160-HW-003-aggressive-intervals) | Worker scheduling intervals too aggressive + settings ignored | [#1113](https://github.com/ruvnet/claude-flow/issues/1113) |
| [HW-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/310-HW-004-runwithtimeout-orphan) | runWithTimeout rejects but does not kill child process | [#1117](https://github.com/ruvnet/claude-flow/issues/1117) |
| [IN-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/170-IN-001-intelligence-stub) | intelligence.cjs is a stub that doesn't actually learn | [#1154](https://github.com/ruvnet/claude-flow/issues/1154) |
| [MM-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/180-MM-001-memory-persist-path) | Remove dead persistPath config option | [#1152](https://github.com/ruvnet/claude-flow/issues/1152) |
| [NS-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/190-NS-001-discovery-default-namespace) | Discovery ops default to wrong namespace | [#1123](https://github.com/ruvnet/claude-flow/issues/1123) |
| [NS-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/200-NS-002-targeted-require-namespace) | Store/delete/retrieve fall back to 'default' + accept 'all' | [#581](https://github.com/ruvnet/claude-flow/issues/581) |
| [NS-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/210-NS-003-namespace-typo-pattern) | Namespace typo 'pattern' vs 'patterns' | [#1136](https://github.com/ruvnet/claude-flow/issues/1136) |
| [RS-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/220-RS-001-better-sqlite3-node24) | ruv-swarm MCP fails on Node 24 — better-sqlite3 missing native bindings | [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185) |
| [RV-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/230-RV-001-force-learn-tick) | force-learn command calls intel.tick() which doesn't exist | [#1156](https://github.com/ruvnet/claude-flow/issues/1156) |
| [RV-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/240-RV-002-trajectory-load) | activeTrajectories not loaded from saved file | [#1157](https://github.com/ruvnet/claude-flow/issues/1157) |
| [RV-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/250-RV-003-trajectory-stats-sync) | trajectory-end does not update stats counters | [ruv-FANN#186](https://github.com/ruvnet/ruv-FANN/issues/186) |
| [SG-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/260-SG-001-init-settings) | Init generates invalid settings | [#1150](https://github.com/ruvnet/claude-flow/issues/1150) |
| [SG-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/270-SG-003-init-helpers-all-paths) | Init missing helpers for --dual, --minimal, hooks, and upgrade paths | [#1169](https://github.com/ruvnet/claude-flow/issues/1169) |
| [SG-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/320-SG-004-wizard-parity) | init wizard lacks parity with init | [#1181](https://github.com/ruvnet/claude-flow/issues/1181) |
| [SG-005](https://github.com/sparkling/claude-flow-patch/tree/master/patch/330-SG-005-start-all-subcommand) | add 'start all' subcommand to start everything at once | [#1177](https://github.com/ruvnet/claude-flow/issues/1177) |
| [SG-006](https://github.com/sparkling/claude-flow-patch/tree/master/patch/340-SG-006-wizard-capture) | Wizard captures permissionRequest hook but never assigns it + topology hardcoded | [#1184](https://github.com/ruvnet/claude-flow/issues/1184) |
| [SG-007](https://github.com/sparkling/claude-flow-patch/tree/master/patch/385-SG-007-init-shallow-copy) | --skip-claude / --only-claude mutate shared init options via shallow copy | [#1188](https://github.com/ruvnet/claude-flow/issues/1188) |
| [SG-008](https://github.com/sparkling/claude-flow-patch/tree/master/patch/440-SG-008-init-config-json) | init should generate .claude-flow/config.json (not config.yaml) | [#1195](https://github.com/ruvnet/claude-flow/issues/1195) |
| [UI-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/280-UI-001-intelligence-stats-crash) | intelligence stats crashes on .toFixed() | [#1145](https://github.com/ruvnet/claude-flow/issues/1145) |
| [UI-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/290-UI-002-neural-status-not-loaded) | neural status shows "Not loaded" | [#1146](https://github.com/ruvnet/claude-flow/issues/1146) |
| [WM-001](https://github.com/sparkling/claude-flow-patch/tree/master/patch/350-WM-001-memory-wiring) | Wire @claude-flow/memory HybridBackend into CLI | [#829](https://github.com/ruvnet/claude-flow/issues/829) |
| [WM-002](https://github.com/sparkling/claude-flow-patch/tree/master/patch/360-WM-002-config-respect) | Neural config gating (neural.enabled not consumed at runtime) | [#1185](https://github.com/ruvnet/claude-flow/issues/1185) |
| [WM-003](https://github.com/sparkling/claude-flow-patch/tree/master/patch/370-WM-003-auto-memory-bridge) | Activate AutoMemoryBridge in auto-memory-hook.mjs | [#1102](https://github.com/ruvnet/claude-flow/issues/1102) |
| [WM-004](https://github.com/sparkling/claude-flow-patch/tree/master/patch/390-WM-004-source-hook-fail-loud) | Source hook silently falls back to JsonFileBackend | [#1190](https://github.com/ruvnet/claude-flow/issues/1190) |
| [WM-005](https://github.com/sparkling/claude-flow-patch/tree/master/patch/400-WM-005-memory-init-config-json) | memory-initializer reads config.yaml with hand-rolled regex instead of config.json | [#1191](https://github.com/ruvnet/claude-flow/issues/1191) |
| [WM-006](https://github.com/sparkling/claude-flow-patch/tree/master/patch/410-WM-006-neural-config-json) | intelligence.js reads neural.enabled from config.yaml regex instead of config.json | [#1192](https://github.com/ruvnet/claude-flow/issues/1192) |
<!-- GENERATED:npm-defects:end -->

## Quick Start

Patch first, then initialize projects.

```bash
# 1) apply patches (global npx cache)
npx --yes @sparkleideas/claude-flow-patch --global

# 2) verify sentinels
npx --yes @sparkleideas/claude-flow-patch check

# 3) now initialize or upgrade project
npx @claude-flow/cli@latest init
# or
npx @claude-flow/cli@latest init upgrade
```

If you already initialized before patching:

```bash
npx --yes @sparkleideas/claude-flow-patch repair --target /path/to/project
```

## CLI Commands

| Command | Purpose |
|---|---|
| `claude-flow-patch [--global] [--target <dir>]` | Apply all patches (default: `--global`) |
| `claude-flow-patch apply <ID>` | Apply a single patch by defect ID (e.g. `SG-002`) |
| `claude-flow-patch check` | Verify patch sentinels and auto-detect drift |
| `claude-flow-patch repair --target <dir> [--source auto\|local\|global] [--dry-run]` | Rehydrate `.claude/helpers` in projects initialized before patching |

## Target Behavior

| Flag | Patched location |
|---|---|
| (none) | Global npx cache (default) |
| `--global` | `~/.npm/_npx/*/node_modules/...` |
| `--target <dir>` | `<dir>/node_modules/...` |
| `--global --target <dir>` | Both locations |

Use `--target` when your project has a local `@claude-flow/cli` install.

## Why `repair` Exists

Some fixes patch generator code (`init/executor.js`, `init/settings-generator.js`, `init/helpers-generator.js`). Those fixes affect future generated files only.

If your repo was initialized before patching, existing `.claude/helpers/*` can remain stale. `repair` copies patched helper files into the target repo and creates .js/.cjs compatibility copies where needed.

## How Patching Works

1. Locate CLI/package targets.
2. Concatenate shared helpers (`lib/common.py`) with each defect `fix.py`.
3. Apply string-based replacements with idempotency guards.
4. Validate with sentinel checks.

Design guarantees:

- **Idempotent**: safe to re-run
- **Non-destructive**: modifies local cache/install only
- **Ordered**: dependent patches applied in sequence (e.g. NS-001 -> NS-002 -> NS-003)
- **Platform-aware**: macOS-specific patches auto-skip on Linux

## Auto-Reapply on Update

When `npx` fetches a new version of `@claude-flow/cli`, `ruvector`, or `ruv-swarm`, it replaces the cached files and wipes all patches. Set up a sentinel to detect this and auto-reapply.

### Claude Code Hook (Recommended for AI Agents)

Add a `session_start` hook to `.claude/settings.json` so patches are checked every time Claude starts:

```jsonc
// .claude/settings.json
{
  "hooks": {
    "session_start": [
      {
        "command": "npx --yes @sparkleideas/claude-flow-patch check",
        "timeout": 30000
      }
    ]
  }
}
```

The `check` command verifies all sentinels. If any patch is missing, it reapplies automatically. The check is fast (~2s) and idempotent.

### Cron

```bash
*/5 * * * * npx --yes @sparkleideas/claude-flow-patch check >> /tmp/patch-sentinel.log 2>&1
```

### npm postinstall

If `@claude-flow/cli` is a project dependency:

```jsonc
// package.json
{
  "scripts": {
    "postinstall": "npx --yes @sparkleideas/claude-flow-patch --target ."
  }
}
```

## Compatibility

- Tested with `@claude-flow/cli@3.1.0-alpha.41`
- Tested with `ruv-swarm@1.0.20`
- Requires Bash + Python 3.6+
- Linux and macOS supported

## Links

- Homepage: https://sparklingideas.co.uk/claude-flow/patch
- GitHub: https://github.com/sparkling/claude-flow-patch
- Issues: https://github.com/sparkling/claude-flow-patch/issues
