# Claude Code Configuration -- claude-flow-patch

Patches for `@claude-flow/cli` **v3.1.0-alpha.40** and `ruv-swarm` **v1.0.20**.

## Rules

- NEVER modify files inside the npm/npx cache directly -- always edit `fix.py` scripts in `patch/`
- ALWAYS run `bash patch-all.sh` to apply changes, never run individual `fix.py` files standalone
- ALWAYS verify with `bash check-patches.sh` after applying
- Each `fix.py` uses `patch()` or `patch_all()` from `lib/common.py` -- these are idempotent
- Patch order matters: NS-001 before NS-002 before NS-003
- EVERY patch MUST have a GitHub issue -- create one if none exists
- ALWAYS update ALL listing files when adding a patch (see checklist below)

## Project Structure

```
patch-all.sh           # Orchestrator -- applies all patches in order
check-patches.sh       # Sentinel -- detects wipes, auto-reapplies
lib/common.py          # Shared helpers: patch(), patch_all(), file paths
patch/                 # One directory per issue
  {PREFIX}-{NNN}-{slug}/
    README.md          # Bug report: title, severity, root cause, fix
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
| IN | Intelligence | 1 |
| SG | Settings Generator | 1 |
| MM | Memory Management | 1 |
| HK | Hooks | 1 |
| RS | ruv-swarm | 1 |

## All 22 Patches

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
| IN-001 | [#1154 intelligence.cjs generated as stub instead of full version](https://github.com/ruvnet/claude-flow/issues/1154) | High |
| SG-001 | [#1150 Init generates invalid hooks and permissions](https://github.com/ruvnet/claude-flow/issues/1150) | High |
| MM-001 | [#1152 memory-initializer.js ignores persistPath](https://github.com/ruvnet/claude-flow/issues/1152) | Medium |
| HK-001 | [#1155 post-edit hook records file_path as "unknown" -- reads env var instead of stdin JSON](https://github.com/ruvnet/claude-flow/issues/1155) | Medium |
| RS-001 | [ruv-FANN#185 ruv-swarm: better-sqlite3 lacks Node 24 binaries](https://github.com/ruvnet/ruv-FANN/issues/185) | Critical |

---

## Writing a New Patch (Full Workflow)

### Step 1: GitHub Issue

Search for an existing issue first:

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

**If an issue exists**: comment on it with the root cause and fix. Note the issue number.

```bash
gh issue comment <NUMBER> --repo ruvnet/claude-flow --body "Root cause: ...
Fix: ...
Patch: <PREFIX>-<NNN> in github.com/<user>/claude-flow-patch"
```

**If no issue exists**: create one with full details.

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

Save the returned issue URL (e.g. `#1155`).

### Step 2: Create the Patch Directory

```bash
mkdir -p patch/{PREFIX}-{NNN}-{slug}/
```

**Naming conventions**:
- `PREFIX`: 2-letter category code (see table above, or create a new one)
- `NNN`: 3-digit number, sequential within category
- `slug`: lowercase-kebab-case summary (e.g. `post-edit-file-path`)

### Step 3: Write README.md

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

### Step 4: Write fix.py

Create `patch/{PREFIX}-{NNN}-{slug}/fix.py`. Each op uses `patch()` or `patch_all()`:

```python
# {PREFIX}-{NNN}: Short title
# GitHub: #{number}

patch("{PREFIX}-{NNN}a: description of first change",
    TARGET_VAR,        # Path variable from lib/common.py
    """old string""",  # Exact string to find (copy from target file)
    """new string""")  # Replacement string

patch("{PREFIX}-{NNN}b: description of second change",
    TARGET_VAR,
    """old string""",
    """new string""")
```

**API**:
- `patch(label, filepath, old, new)` -- replace first occurrence only
- `patch_all(label, filepath, old, new)` -- replace ALL occurrences

**Path variables** (from `lib/common.py`):

| Variable | File |
|----------|------|
| `HWE` | `services/headless-worker-executor.js` |
| `WD` | `services/worker-daemon.js` |
| `DJ` | `commands/daemon.js` |
| `DOC` | `commands/doctor.js` |
| `MI` | `memory/memory-initializer.js` |
| `MCP_MEMORY` | `mcp-tools/memory-tools.js` |
| `MCP_HOOKS` | `mcp-tools/hooks-tools.js` |
| `CLI_MEMORY` | `commands/memory.js` |
| `EMB_TOOLS` | `mcp-tools/embeddings-tools.js` |
| `SETTINGS_GEN` | `init/settings-generator.js` |
| `HELPERS_GEN` | `init/helpers-generator.js` |
| `EXECUTOR` | `init/executor.js` |
| `ruvector_cli` | `ruvector/bin/cli.js` (separate package) |

If you need a new path variable, add it to `lib/common.py` following the existing pattern.

### Step 5: Add to patch-all.sh

Open `patch-all.sh` and add the fix.py in the correct category section:

```bash
# {Category Name}
fix="$SCRIPT_DIR/patch/{PREFIX}-{NNN}-{slug}/fix.py"
[ -f "$fix" ] && cat "$fix"
```

**Order matters** if the patch depends on another patch being applied first.

### Step 6: Add sentinel check to check-patches.sh

Add a `check` call with a unique string that only exists after the patch is applied:

```bash
# {PREFIX} -- {Category}
check "unique_string_from_patched_code" "$TARGET_FILE"  # {PREFIX}-{NNN}
```

Choose a string that:
- Only appears in the file AFTER the patch is applied
- Is specific enough not to match unrelated code
- Doesn't need regex escaping in `grep -q`

### Step 7: Update ALL Listing Files

**This is critical -- every patch must appear in ALL of these**:

1. **`README.md`** -- Add row to the category table in Patch Index section. Update totals.
2. **`CLAUDE.md`** (this file) -- Add row to "All N Patches" table. Update count + category table.
3. **`AGENTS.md`** -- Add row to the category table. Update count in Purpose section.

### Step 8: Test

```bash
# Apply (should show "Applied: ...")
bash patch-all.sh --scope global

# Re-run (should show "0 applied, N already present")
bash patch-all.sh --scope global

# Sentinel (should show "OK: All patches verified")
bash check-patches.sh
```

### Full Checklist

- [ ] GitHub issue exists (search first, create if needed)
- [ ] `patch/{PREFIX}-{NNN}-{slug}/README.md` created
- [ ] `patch/{PREFIX}-{NNN}-{slug}/fix.py` created with `patch()`/`patch_all()` calls
- [ ] Path variable added to `lib/common.py` (if targeting a new file)
- [ ] `patch-all.sh` updated with new fix.py in correct section
- [ ] `check-patches.sh` updated with sentinel grep
- [ ] `README.md` Patch Index table updated + totals updated
- [ ] `CLAUDE.md` patch table updated + category table updated + totals updated
- [ ] `AGENTS.md` patch table updated + totals updated
- [ ] `bash patch-all.sh` applies successfully
- [ ] `bash patch-all.sh` is idempotent (0 applied on re-run)
- [ ] `bash check-patches.sh` shows OK

## Commands

```bash
# Apply all patches
bash patch-all.sh

# Apply to specific scope
bash patch-all.sh --scope global
bash patch-all.sh --scope local

# Verify patches
bash check-patches.sh

# Check target version
grep '"version"' ~/.npm/_npx/*/node_modules/@claude-flow/cli/package.json
```
