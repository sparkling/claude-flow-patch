# claude-flow-patch

Runtime patches for `@claude-flow/cli` **v3.1.0-alpha.41**, `ruvector`, and `ruv-swarm` **v1.0.20**.

## Terminology

| Term | Meaning | Example |
|------|---------|---------|
| **Defect** | A tracked problem (bug or missing feature). Each defect has its own directory under `patch/` with a README.md and fix.py. | "Defect HW-001", "29 defects across 13 categories" |
| **Patch** | The code change that addresses a defect. Implemented as `fix.py` (or `fix.sh`) using `patch()`/`patch_all()` calls. We patch because we can't fix upstream. | "fix.py contains 3 patch ops" |
| **GitHub issue** | The upstream issue on github.com/ruvnet/claude-flow. Always say "GitHub issue", never just "issue". | "GitHub issue #1111" |
| **Defect ID** | The unique identifier for a defect: `{PREFIX}-{NNN}`. | HW-001, NS-003, RS-001 |
| **Execution order number** | 3-digit numeric prefix on the directory name that controls patch application order. Spaced by 10 to allow insertions. | `010-`, `170-`, `270-` |

- Use **defect** for the tracked problem (the folder, the ID, the concept).
- Use **patch** for the code change applied to the library (`fix.py`, `patch()`, `patch-all.sh`).
- Always say **GitHub issue** for the upstream reference -- never bare "issue".

## Rules

- NEVER modify files inside the npm/npx cache directly -- edit `fix.py` scripts in `patch/`
- NEVER run individual `fix.py` files standalone -- always use `bash patch-all.sh`
- NEVER delete a defect without confirming it is truly obsolete -- see "Removing a Defect" below
- NEVER reuse a defect ID that was previously assigned to a different GitHub issue
- ONE defect directory and ONE fix.py per GitHub issue -- do not combine multiple GitHub issues into one defect or split one GitHub issue across multiple defects
- ALWAYS verify with `bash check-patches.sh` after applying
- ALWAYS update ALL listing files when adding/removing a defect (see checklist)
- Execution order is determined by the numeric prefix on each defect directory name. Dependencies between defects are expressed by assigning lower numbers to prerequisites.

## Project Structure

```
patch-all.sh            # Orchestrator -- globs patch/*/fix.py (no hardcoded list)
check-patches.sh        # Sentinel -- reads patch/*/sentinel files dynamically
repair-post-init.sh     # Post-init helper repair for existing projects
lib/
  common.py             # Shared helpers: patch(), patch_all(), path variables
  discover.mjs          # Dynamic discovery: scans patch/*/ → structured JSON
  categories.json       # Prefix-to-label mapping (one line per category)
scripts/
  update-docs.mjs       # Regenerates doc tables from discovery (npm run update-docs)
  upstream-log.mjs      # Show recent upstream releases (npm run upstream-log [count])
patch/
  {NNN}-{PREFIX}-{NNN}-{slug}/    # NNN = 3-digit execution order
    README.md           # Defect report: title, severity, root cause, fix
    fix.py              # patch()/patch_all() calls
    sentinel            # Verification directives for check-patches.sh
```

## Target Packages

| Package | Version | Location | Env var |
|---------|---------|----------|---------|
| `@claude-flow/cli` | `3.1.0-alpha.41` | `~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/` | `BASE` |
| `ruvector` | (bundled) | `~/.npm/_npx/*/node_modules/ruvector/bin/cli.js` | `RUVECTOR_CLI` |
| `ruv-swarm` | `1.0.20` | `~/.npm/_npx/*/node_modules/ruv-swarm/` | (found via glob) |

`BASE` is set by `patch-all.sh`. All path variables in `lib/common.py` derive from it.
`RUVECTOR_CLI` is set by `patch-all.sh` to the ruvector CLI entry point.
RS-001 locates its own target via `find`.

## GitHub Issue Policy

Every defect MUST link to a GitHub issue. No exceptions.

### Before creating a new defect, always search first:

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

### If an open GitHub issue exists:

Post a single comment with the patch details. Do NOT post multiple comments, closing remarks, or history. One clean comment per defect:

```bash
gh issue comment <NUMBER> --repo ruvnet/claude-flow --body "$(cat <<'EOF'
## Fix

Defect **{PREFIX}-{NNN}** in [claude-flow-patch](https://github.com/sparkling/claude-flow-patch).

<What the patch does. Be specific. Include a table if multiple ops.>
EOF
)"
```

### If no GitHub issue exists:

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

### Comment hygiene:

- One comment per defect, describing the patch. No meta-commentary.
- If you need to replace a comment, delete the old one first (`gh api -X DELETE`).
- Do not reference defect history, deletion/restoration, or internal decisions.

## Defect Categories

<!-- GENERATED:defect-tables:begin -->
| Prefix | Category | Count |
|--------|----------|-------|
| CF | Config & Doctor | 2 |
| DM | Daemon & Workers | 5 |
| EM | Embeddings & HNSW | 2 |
| GV | Ghost Vectors | 1 |
| HK | Hooks | 3 |
| HW | Headless Worker | 3 |
| IN | Intelligence | 1 |
| MM | Memory Management | 1 |
| NS | Memory Namespace | 3 |
| RS | ruv-swarm | 1 |
| RV | RuVector Intelligence | 3 |
| SG | Settings Generator | 2 |
| UI | Display & Cosmetic | 2 |

## All 29 Defects

| ID | GitHub Issue | Severity |
|----|-------------|----------|
| CF-001 | [#1141 Doctor ignores YAML config files](https://github.com/ruvnet/claude-flow/issues/1141) | Low |
| CF-002 | [#1142 Config export shows hardcoded defaults](https://github.com/ruvnet/claude-flow/issues/1142) | Medium |
| DM-001 | [#1116 daemon.log always 0 bytes](https://github.com/ruvnet/claude-flow/issues/1116) | Medium |
| DM-002 | [#1138 maxCpuLoad=2.0 blocks all workers on multi-core](https://github.com/ruvnet/claude-flow/issues/1138) | Critical |
| DM-003 | [#1077 macOS freemem() always ~0% — workers blocked](https://github.com/ruvnet/claude-flow/issues/1077) | Critical |
| DM-004 | [#1139 Preload worker stub + missing from defaults](https://github.com/ruvnet/claude-flow/issues/1139) | Enhancement |
| DM-005 | [#1140 Consolidation worker stub (no decay/rebuild)](https://github.com/ruvnet/claude-flow/issues/1140) | Enhancement |
| EM-001 | [#1143 Embedding system ignores project config (model + HNSW dims)](https://github.com/ruvnet/claude-flow/issues/1143) | High |
| EM-002 | [#1144 @xenova/transformers cache EACCES](https://github.com/ruvnet/claude-flow/issues/1144) | Medium |
| GV-001 | [#1122 HNSW ghost vectors persist after memory delete](https://github.com/ruvnet/claude-flow/issues/1122) | Medium |
| HK-001 | [#1155 post-edit hook records file_path as "unknown"](https://github.com/ruvnet/claude-flow/issues/1155) | Medium |
| HK-002 | [#1058 MCP hook handlers are stubs that don't persist data](https://github.com/ruvnet/claude-flow/issues/1058) | High |
| HK-003 | [#1158 hooks_metrics MCP handler returns hardcoded fake data](https://github.com/ruvnet/claude-flow/issues/1158) | High |
| HW-001 | [#1111 Headless workers hang — stdin pipe never closed](https://github.com/ruvnet/claude-flow/issues/1111) | Critical |
| HW-002 | [#1112 Headless failures silently swallowed as success](https://github.com/ruvnet/claude-flow/issues/1112) | High |
| HW-003 | [#1113 Worker scheduling intervals too aggressive](https://github.com/ruvnet/claude-flow/issues/1113) | High |
| IN-001 | [#1154 intelligence.cjs is a stub that doesn't actually learn](https://github.com/ruvnet/claude-flow/issues/1154) | Critical |
| MM-001 | [#1152 Remove dead persistPath config option](https://github.com/ruvnet/claude-flow/issues/1152) | Low |
| NS-001 | [#1123 Discovery ops default to wrong namespace](https://github.com/ruvnet/claude-flow/issues/1123) | Critical |
| NS-002 | [#581 Store/delete/retrieve fall back to 'default' + accept 'all'](https://github.com/ruvnet/claude-flow/issues/581) | Critical |
| NS-003 | [#1136 Namespace typo 'pattern' vs 'patterns'](https://github.com/ruvnet/claude-flow/issues/1136) | Medium |
| RS-001 | [ruv-FANN#185 ruv-swarm MCP fails on Node 24 — better-sqlite3 missing native bindings](https://github.com/ruvnet/ruv-FANN/issues/185) | Critical |
| RV-001 | [#1156 force-learn command calls intel.tick() which doesn't exist](https://github.com/ruvnet/claude-flow/issues/1156) | Medium |
| RV-002 | [#1157 activeTrajectories not loaded from saved file](https://github.com/ruvnet/claude-flow/issues/1157) | High |
| RV-003 | [ruv-FANN#186 trajectory-end does not update stats counters](https://github.com/ruvnet/ruv-FANN/issues/186) | Medium |
| SG-001 | [#1150 Init generates invalid settings](https://github.com/ruvnet/claude-flow/issues/1150) | High |
| SG-003 | [#1169 Init missing helpers for --dual, --minimal, hooks, and upgrade paths](https://github.com/ruvnet/claude-flow/issues/1169) | Critical |
| UI-001 | [#1145 intelligence stats crashes on .toFixed()](https://github.com/ruvnet/claude-flow/issues/1145) | Critical |
| UI-002 | [#1146 neural status shows "Not loaded"](https://github.com/ruvnet/claude-flow/issues/1146) | Low |
<!-- GENERATED:defect-tables:end -->

---

## Creating a New Defect

Follow every step. Do not skip any.

### Step 1: Find or create a GitHub issue

Search first:

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

- **GitHub issue exists and is open**: note the number, post a patch comment (see GitHub Issue Policy above).
- **GitHub issue exists but is closed**: reopen it with a comment explaining why.
- **No GitHub issue exists**: create one (see GitHub Issue Policy above). Save the returned `#number`.

### Step 2: Choose a defect ID

Format: `{PREFIX}-{NNN}`

- `PREFIX`: 2-letter category code from the table above. Create a new prefix if no existing category fits.
- `NNN`: next sequential number within that category (e.g. if HK-002 exists, next is HK-003).
- NEVER reuse an ID previously assigned to a different GitHub issue, even if that defect was deleted.

### Step 3: Create the defect directory

```bash
mkdir -p patch/{ORDER}-{PREFIX}-{NNN}-{slug}/
```

`ORDER`: 3-digit execution order number in 10-increments (e.g. `300`). Choose the next available number. If this defect depends on another, its number must be higher than the dependency's.

`slug`: lowercase-kebab-case summary (e.g. `post-edit-file-path`).

### Step 4: Write README.md

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

### Step 5: Write fix.py and sentinel

Create `patch/{PREFIX}-{NNN}-{slug}/fix.py` with patch calls:

```python
# {PREFIX}-{NNN}: Short title
# GitHub: #{number}

patch("{PREFIX}-{NNN}a: description of first change",
    TARGET_VAR,        # Path variable from lib/common.py
    """old string""",  # Exact string to find (copy-paste from target file)
    """new string""")  # Replacement string
```

Create `patch/{PREFIX}-{NNN}-{slug}/sentinel` to declare how `check-patches.sh` verifies this patch:

```
grep "unique_string" path/to/target.js
```

**Sentinel directives** (one per line):

```
grep "unique_string" path/to/target.js     # String must be present
absent "old_string" path/to/target.js       # String must be absent
none                                         # No sentinel (e.g. permissions-only)
package: ruvector                            # Gate on optional package
```

Paths are relative to `@claude-flow/cli/dist/src/` (e.g. `services/worker-daemon.js`, `init/executor.js`). For external packages, add `package: ruvector` or `package: ruv-swarm` and use paths relative to that package root.

The sentinel pattern must:
- Only appear in the target file AFTER the patch is applied
- Be specific enough not to match unrelated code

**Patch API**:
- `patch(label, filepath, old, new)` -- replace first occurrence only
- `patch_all(label, filepath, old, new)` -- replace ALL occurrences

Both are idempotent: skip if `new` already present, warn if `old` not found.

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

### Step 6: Update docs and test

```bash
# Regenerate all documentation from dynamic discovery
npm run update-docs

# Apply -- should show "Applied: ..."
bash patch-all.sh --scope global

# Idempotency -- should show "0 applied, N already present"
bash patch-all.sh --scope global

# Sentinel -- should show "OK: All patches verified"
bash check-patches.sh

# Tests
npm test
```

**No manual edits needed** to `patch-all.sh`, `check-patches.sh`, `README.md`, `CLAUDE.md`, `npm/README.md`, or `npm/config.json`. Dynamic discovery handles everything.

### Full Checklist

- [ ] GitHub issue exists (searched first, created only if none found)
- [ ] GitHub issue comment posted with patch details
- [ ] `patch/{PREFIX}-{NNN}-{slug}/README.md` created with all required sections
- [ ] `patch/{PREFIX}-{NNN}-{slug}/fix.py` created with `patch()`/`patch_all()` calls
- [ ] `patch/{PREFIX}-{NNN}-{slug}/sentinel` created with verification directives
- [ ] Path variable added to `lib/common.py` (if targeting a new file)
- [ ] If new category prefix: add one line to `lib/categories.json`
- [ ] `npm run update-docs` regenerates all doc tables
- [ ] `bash patch-all.sh` applies successfully
- [ ] `bash patch-all.sh` is idempotent (0 applied on re-run)
- [ ] `bash check-patches.sh` shows OK
- [ ] Tests added to `03-patch-apply.test.mjs` and `04-idempotency.test.mjs`
- [ ] `npm test` passes

---

## Removing a Defect

Before removing any defect:

1. Confirm the bug is genuinely fixed upstream or the patch is truly unreachable.
2. Do NOT remove a defect just because a local workaround exists -- the MCP-level patch may still be needed.
3. If removing, retire the defect ID permanently. Never reassign a deleted ID to a different GitHub issue.
4. Run `npm run update-docs` to regenerate all documentation.

---

## Testing

```bash
npm test                                    # run all tests
node --test tests/02-common-library.test.mjs  # run one suite
```

Uses `node:test` (built-in, zero dependencies). Tests live in `tests/`.

| Suite | File | What it covers |
|-------|------|----------------|
| CLI dispatch | `01-cli-dispatch.test.mjs` | `--help`, unknown commands, `apply` valid/invalid IDs, `check` delegation |
| common.py | `02-common-library.test.mjs` | `patch()` apply/skip/warn/idempotent, `patch_all()`, path resolution from `BASE` |
| Patch apply | `03-patch-apply.test.mjs` | Individual patches (HW-001, DM-002, SG-002) applied against fixtures |
| Idempotency | `04-idempotency.test.mjs` | Double-apply produces identical files, second run reports skipped |
| Error handling | `05-error-handling.test.mjs` | Empty `BASE`, `/dev/null`, nonexistent dir, invalid `--scope` |

### Fixtures

`tests/fixtures/cli/dist/src/` mirrors the subset of `@claude-flow/cli` that patches target. Each file contains the exact `old` strings patches search for — just enough for `patch()` to match, not full upstream JS files.

`tests/helpers/` provides:
- `fixture-factory.mjs` — copies fixtures to a temp dir, returns `{ base, cleanup }`
- `run-cli.mjs` — wraps `spawnSync('node', ['bin/claude-flow-patch.mjs', ...args])`
- `run-python.mjs` — concatenates `common.py` + `fix.py` and pipes to `python3` with `BASE` set

### Adding tests for a new defect

1. Ensure `tests/fixtures/cli/dist/src/<target-file>.js` contains the `old` string from the new `fix.py`
2. Add a row to the `TESTS` array in `03-patch-apply.test.mjs`
3. Add a row to the `PATCHES` array in `04-idempotency.test.mjs`
4. Run `npm test`

---

## Commands

```bash
# Apply all patches (default: both global + local)
bash patch-all.sh

# Apply to specific scope
bash patch-all.sh --scope global
bash patch-all.sh --scope local

# Verify patches
bash check-patches.sh

# Repair a project initialized before patching
bash repair-post-init.sh --target /path/to/project

# Check target version
grep '"version"' ~/.npm/_npx/*/node_modules/@claude-flow/cli/package.json

# Show recent upstream releases (requires npm; gh optional for commit messages)
npm run upstream-log           # last 10 versions
npm run upstream-log -- 20     # last 20 versions
npm run upstream-log -- --diff # also show dependency changes vs baseline
```

### Scope Options

| Scope | Target | When to use |
|-------|--------|-------------|
| `both` | Global npx cache + local `node_modules` (default) | Normal usage -- covers both invocation paths |
| `global` | `~/.npm/_npx/*/node_modules/` only | CI or when no local install exists |
| `local` | `./node_modules/` and parent directories only | Monorepo or project-local installs |

`npx @claude-flow/cli` uses local `node_modules` if present, otherwise the global npx cache. Patching `both` ensures fixes apply regardless of invocation method.

## Dependency Order

Execution order is controlled by the 3-digit numeric prefix on each directory name.
`patch-all.sh` globs `patch/*/fix.py` which sorts lexicographically, so numeric prefixes
execute in the correct order automatically.

Two dependency chains exist:

| Chain | Directories | Reason |
|-------|-------------|--------|
| IN-001 -> SG-003 | `170-IN-001-*` before `270-SG-003-*` | SG-003's `old_string` contains code introduced by IN-001 |
| NS-001 -> NS-002 -> NS-003 | `190-NS-001-*` before `200-NS-002-*` before `210-NS-003-*` | Sequential namespace fixes |

All other patches are independent.

## Key Design Decisions

- **Idempotent**: `patch()` checks if `new` string is already present before replacing.
- **Non-destructive**: patches only modify the npx cache, never the npm registry package.
- **Platform-aware**: DM-003 is macOS-only (auto-skipped on Linux).
- **Sentinel-guarded**: `check-patches.sh` detects cache wipes and auto-reapplies.
