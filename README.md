# claude-flow-patch

Community patches for [`@claude-flow/cli`](https://www.npmjs.com/package/@claude-flow/cli) **v3.1.0-alpha.40**, [`ruvector`](https://www.npmjs.com/package/ruvector), and [`ruv-swarm`](https://www.npmjs.com/package/ruv-swarm) **v1.0.20**.

These patches fix 26 bugs and missing features across 13 categories. They are applied at runtime via idempotent Python scripts that perform targeted string replacements on the npx-cached source files.

## Quick Start

**Patch before init.** Several patches fix the init/generator scripts. If you run `claude-flow init` before patching, the generated `.claude/helpers/` files will be stubs with no learning, no PageRank, and no-op feedback. Always patch first:

```bash
# 1. Patch first -- fixes the init generators
bash patch-all.sh

# 2. Then init (or re-init if already initialized)
npx @claude-flow/cli@latest init            # fresh project
npx @claude-flow/cli@latest init upgrade    # existing project

# 3. Verify
bash check-patches.sh

# Check target version
grep '"version"' ~/.npm/_npx/*/node_modules/@claude-flow/cli/package.json
```

If you already initialized before patching, see [Init-Script Patches](#init-script-patches-local-project-action-required) below.

### Scope Options

```bash
bash patch-all.sh                # both global + local (default)
bash patch-all.sh --scope global # only ~/.npm/_npx/*/node_modules/
bash patch-all.sh --scope local  # only ./node_modules/ and parents
```

**Why both scopes?** `npx @claude-flow/cli` uses your local `node_modules` if present, otherwise the global npx cache. Patching both ensures fixes work regardless of how the CLI is invoked.

## How It Works

1. `patch-all.sh` locates the `@claude-flow/cli` dist files in the npm/npx cache
2. Concatenates `lib/common.py` (shared `patch()`/`patch_all()` helpers) with each `fix.py`
3. Runs them as a single Python process that performs string replacements
4. Each patch is idempotent: skips if already applied, warns if source changed

The `check-patches.sh` sentinel runs on session start to detect npx cache wipes and auto-reapply.

### Target Packages

| Package | Version | Location | Env var |
|---------|---------|----------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.40` | `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/` | `BASE` |
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
  README.md              # This file (single source of truth)
  CLAUDE.md              # Claude Code configuration (init boilerplate)
  AGENTS.md              # Codex agent configuration (init --codex boilerplate)
  patch-all.sh           # Apply all patches (entry point)
  check-patches.sh       # Sentinel: verify + auto-reapply
  lib/
    common.py            # Shared patch()/patch_all() helpers + path variables
  patch/
    {PREFIX}-{NNN}-{slug}/
      README.md          # Defect report: title, severity, root cause, fix
      fix.py             # Idempotent patch script (25 defects)
      fix.sh             # Shell-based patch script (EM-002)
    (26 defect directories total)
```

## Defect Index

26 defects across 13 categories.

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

### MM -- Memory Management

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [MM&#8209;001](patch/MM-001-memory-persist-path/) | memory-initializer.js ignores persistPath config, hardcodes .swarm/ | Medium | [#1152](https://github.com/ruvnet/claude-flow/issues/1152) |

### HK -- Hooks

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [HK&#8209;001](patch/HK-001-post-edit-file-path/) | post-edit hook records file_path as "unknown" -- reads env var instead of stdin JSON | Medium | [#1155](https://github.com/ruvnet/claude-flow/issues/1155) |
| [HK&#8209;002](patch/HK-002-hooks-tools-stub/) | MCP hook handlers (postEdit, postCommand, postTask) return fake data without persisting | High | [#1058](https://github.com/ruvnet/claude-flow/issues/1058) |

### RV -- RuVector Intelligence

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RV&#8209;001](patch/RV-001-force-learn-tick/) | `force-learn` command crashes -- calls `intel.tick()` which doesn't exist on the Intelligence class | Medium | [#1156](https://github.com/ruvnet/claude-flow/issues/1156) |
| [RV&#8209;002](patch/RV-002-trajectory-load/) | `activeTrajectories` not loaded from file -- `trajectory-step`/`trajectory-end` fail with "No active trajectory" | High | [#1157](https://github.com/ruvnet/claude-flow/issues/1157) |

### RS -- ruv-swarm

| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |
|----|-------------|----------|--------------|
| [RS&#8209;001](patch/RS-001-better-sqlite3-node24/) | `better-sqlite3@^11.6.0` lacks Node 24 prebuilt binaries -- MCP server crashes on startup | Critical | [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185) |

## Init-Script Patches (Local Project Action Required)

Four patches target the **init/generator scripts** (`executor.js`, `settings-generator.js`, `helpers-generator.js`). These fix the code that *generates* your `.claude/` project files -- but applying `patch-all.sh` does **not** update files already generated in your project. You must take one additional step.

### Affected Defects

| ID | Generator patched | Local file affected | Problem if not refreshed |
|----|-------------------|---------------------|--------------------------|
| IN-001 | `init/executor.js` | `.claude/helpers/intelligence.cjs` | 197-line stub: no PageRank, no graph, `feedback()` is a no-op, no learning |
| HK-001 | `init/helpers-generator.js` | `.claude/helpers/hook-handler.cjs` | Reads env vars instead of stdin JSON; post-edit logs `file: "unknown"` |
| SG-001 | `init/settings-generator.js` | `.claude/settings.json` | May contain invalid hook events, broad permissions, relative paths |
| MM-001 | `init/executor.js` | `.claude-flow/config.yaml` | Misleading `persistPath` setting that nothing reads |

### How to Fix

**Option A: Copy full helpers from the package** (recommended)

After applying `patch-all.sh`, copy the real helper files over the stubs:

```bash
bash patch-all.sh
SRC=$(find ~/.npm/_npx -path '*/@claude-flow/cli/.claude/helpers' -type d 2>/dev/null | head -1)
for f in intelligence.cjs hook-handler.cjs session.js learning-service.mjs metrics-db.mjs statusline.cjs; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" .claude/helpers/ && echo "Copied: $f"
done
```

**Option B: Re-run init upgrade** (regenerates from patched scripts)

```bash
bash patch-all.sh
npx @claude-flow/cli@latest init upgrade --force
```

Caution: Option B may overwrite other customizations in `.claude/`.

### Why This Happens

These patches fix the **generator functions** inside the npm package (e.g., `generateIntelligenceStub()` in `executor.js`). When the generator runs via `claude-flow init`, it produces the project files in `.claude/helpers/`. If your project was initialized *before* `patch-all.sh` was applied, the stubs are already on disk. `patch-all.sh` only patches the npm package source -- it does not touch files already generated in your project.

Additionally, `init upgrade` only force-overwrites 3 "critical" helpers (`auto-memory-hook.mjs`, `hook-handler.cjs`, `intelligence.cjs`). The other 30+ helper files (shell scripts for daemon management, health monitoring, security scanning, swarm hooks, etc.) are only copied on fresh `init`, not on upgrade. If these are missing, use Option A above to copy the full set.

## Contributing

### Terminology

| Term | Meaning | Example |
|------|---------|---------|
| **Defect** | A tracked problem (bug or missing feature). Each defect has its own directory under `patch/` with a README.md and fix.py. | "Defect HW-001" |
| **Patch** | The code change that addresses a defect. Implemented as `fix.py` (or `fix.sh`) using `patch()`/`patch_all()` calls. | "fix.py contains 3 patch ops" |
| **GitHub issue** | The upstream issue on github.com/ruvnet/claude-flow. Use "GitHub issue" to distinguish from defects. | "GitHub issue #1111" |
| **Defect ID** | The unique identifier for a defect: `{PREFIX}-{NNN}`. | HW-001, NS-003, RS-001 |

### Rules

- NEVER modify files inside the npm/npx cache directly -- edit `fix.py` scripts in `patch/`
- NEVER run individual `fix.py` files standalone -- always use `bash patch-all.sh`
- NEVER delete a defect without confirming it is truly obsolete -- see [Removing a Defect](#removing-a-defect)
- NEVER reuse a defect ID that was previously assigned to a different GitHub issue
- ONE defect directory and ONE fix.py per GitHub issue -- do not combine multiple GitHub issues into one defect or split one GitHub issue across multiple defects
- ALWAYS verify with `bash check-patches.sh` after applying
- ALWAYS update this README when adding or removing a defect (see [checklist](#full-checklist))
- Patch order matters: NS-001 before NS-002 before NS-003

### GitHub Issue Policy

Every defect MUST link to a GitHub issue. No exceptions.

**Before creating a new defect, always search first:**

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

**If an open GitHub issue exists**, post a single comment with the patch details (one comment per defect, no meta-commentary):

```bash
gh issue comment <NUMBER> --repo ruvnet/claude-flow --body "$(cat <<'EOF'
## Fix

Defect **{PREFIX}-{NNN}** in [claude-flow-patch](https://github.com/hpettersen/claude-flow-patch).

<What the patch does. Be specific. Include a table if multiple ops.>
EOF
)"
```

**If no GitHub issue exists**, create one:

```bash
gh issue create --repo ruvnet/claude-flow \
  --title "Bug: <short description>" \
  --body "$(cat <<'EOF'
## Summary
<1-2 sentences>

## Root Cause
<what's wrong and why>

## Fix
<what the patch does>

## Files Affected
- <dist/src/path/to/file.js>
EOF
)"
```

Save the returned GitHub issue number for the defect README.md.

**Comment hygiene:** one comment per defect. If you need to replace a comment, delete the old one first (`gh api -X DELETE`). Do not reference defect history or internal decisions.

### Creating a New Defect

Follow every step. Do not skip any.

#### Step 1: Find or create a GitHub issue

Search first:

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

- **GitHub issue exists and is open**: note the number, post a patch comment (see [GitHub Issue Policy](#github-issue-policy)).
- **GitHub issue exists but is closed**: reopen it with a comment explaining why.
- **No GitHub issue exists**: create one. Save the returned `#number`.

#### Step 2: Choose a defect ID

Format: `{PREFIX}-{NNN}`

- `PREFIX`: 2-letter category code from the [Defect Index](#defect-index). Create a new prefix if no existing category fits.
- `NNN`: next sequential number within that category (e.g. if HK-002 exists, next is HK-003).
- NEVER reuse an ID previously assigned to a different GitHub issue, even if that defect was deleted.

#### Step 3: Create the defect directory

```bash
mkdir -p patch/{PREFIX}-{NNN}-{slug}/
```

`slug`: lowercase-kebab-case summary (e.g. `post-edit-file-path`).

#### Step 4: Write README.md

Create `patch/{PREFIX}-{NNN}-{slug}/README.md`:

```markdown
# {PREFIX}-{NNN}: Short title

**Severity**: Critical | High | Medium | Low | Enhancement
**GitHub**: [#{number}](https://github.com/ruvnet/claude-flow/issues/{number})

## Root Cause

<What's wrong and why. Include code snippets showing the bug.>

## Fix

<What the patch does. Be specific about each change.>

## Files Patched

- <relative path from dist/src/ for each file>

## Ops

<N> ops in fix.py
```

#### Step 5: Write fix.py

Create `patch/{PREFIX}-{NNN}-{slug}/fix.py`:

```python
# {PREFIX}-{NNN}: Short title
# GitHub: #{number}

patch("{PREFIX}-{NNN}a: description of first change",
    TARGET_VAR,        # Path variable from lib/common.py
    """old string""",  # Exact string to find (copy-paste from target file)
    """new string""")  # Replacement string
```

**API**:
- `patch(label, filepath, old, new)` -- replace first occurrence only
- `patch_all(label, filepath, old, new)` -- replace ALL occurrences

Both are idempotent: skip if `new` already present, warn if `old` not found.

For shell-based patches (e.g. EM-002), use `fix.sh` instead.

**Path variables** (defined in `lib/common.py`):

| Variable | File | Package |
|----------|------|---------|
| `HWE` | `services/headless-worker-executor.js` | @claude-flow/cli |
| `WD` | `services/worker-daemon.js` | @claude-flow/cli |
| `DJ` | `commands/daemon.js` | @claude-flow/cli |
| `DOC` | `commands/doctor.js` | @claude-flow/cli |
| `MI` | `memory/memory-initializer.js` | @claude-flow/cli |
| `MCP_MEMORY` | `mcp-tools/memory-tools.js` | @claude-flow/cli |
| `MCP_HOOKS` | `mcp-tools/hooks-tools.js` | @claude-flow/cli |
| `CLI_MEMORY` | `commands/memory.js` | @claude-flow/cli |
| `CONF` | `commands/config.js` | @claude-flow/cli |
| `HOOKS_CMD` | `commands/hooks.js` | @claude-flow/cli |
| `NEURAL` | `commands/neural.js` | @claude-flow/cli |
| `EMB_TOOLS` | `mcp-tools/embeddings-tools.js` | @claude-flow/cli |
| `SETTINGS_GEN` | `init/settings-generator.js` | @claude-flow/cli |
| `HELPERS_GEN` | `init/helpers-generator.js` | @claude-flow/cli |
| `EXECUTOR` | `init/executor.js` | @claude-flow/cli |
| `ruvector_cli` | `bin/cli.js` | ruvector |

To target a new file, add a variable to `lib/common.py` following the existing pattern.

#### Step 6: Register in patch-all.sh

Add the fix.py in the correct category section:

```bash
fix="$SCRIPT_DIR/patch/{PREFIX}-{NNN}-{slug}/fix.py"
[ -f "$fix" ] && cat "$fix"
```

Order matters when patches depend on each other (e.g. NS-001 before NS-002).

#### Step 7: Add sentinel to check-patches.sh

Add a `check` call with a string unique to the patched code:

```bash
check "unique_string_from_patched_code" "$TARGET_FILE"  # {PREFIX}-{NNN}
```

The string must:
- Only appear in the file AFTER the patch is applied
- Be specific enough not to match unrelated code
- Not require regex escaping in `grep -q`

#### Step 8: Update this README

Add a row to the defect's category table in the [Defect Index](#defect-index). If creating a new category, add the category heading and table. Update the totals line.

#### Step 9: Test

```bash
# Apply -- should show "Applied: ..."
bash patch-all.sh --scope global

# Idempotency -- should show "0 applied, N already present"
bash patch-all.sh --scope global

# Sentinel -- should show "OK: All patches verified"
bash check-patches.sh
```

#### Full Checklist

- [ ] GitHub issue exists (searched first, created only if none found)
- [ ] GitHub issue comment posted with patch details
- [ ] `patch/{PREFIX}-{NNN}-{slug}/README.md` created with all required sections
- [ ] `patch/{PREFIX}-{NNN}-{slug}/fix.py` created with `patch()`/`patch_all()` calls
- [ ] Path variable added to `lib/common.py` (if targeting a new file)
- [ ] `patch-all.sh` updated with new fix.py entry
- [ ] `check-patches.sh` updated with sentinel check
- [ ] `README.md` updated (category table row + totals)
- [ ] `bash patch-all.sh` applies successfully
- [ ] `bash patch-all.sh` is idempotent (0 applied on re-run)
- [ ] `bash check-patches.sh` shows OK

### Removing a Defect

Before removing any defect:

1. Confirm the bug is genuinely fixed upstream or the patch is truly unreachable.
2. Do NOT remove a defect just because a local workaround exists -- the MCP-level patch may still be needed.
3. If removing, retire the defect ID permanently. Never reassign a deleted ID to a different GitHub issue.
4. Update this README (category table + totals).
5. Remove the sentinel from `check-patches.sh`.
6. Remove the entry from `patch-all.sh`.

## Compatibility

- Tested against `@claude-flow/cli@3.1.0-alpha.40` and `ruv-swarm@1.0.20`
- Requires Python 3.6+ and Bash
- Works on Linux and macOS (DM-003 is macOS-only, auto-skipped on Linux)

## License

MIT
