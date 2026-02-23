# @sparkleideas/claude-flow-patch

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
- ALWAYS run `npm run preflight` before staging — the pre-commit hook (`hooks/pre-commit`) enforces this via `--check` mode
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
  preflight.mjs         # Pre-commit sync: doc tables, versions, config (npm run preflight)
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

Every defect MUST link to exactly one GitHub issue. No exceptions. One defect = one GitHub issue.

### Where the fix description goes

The `## Fix` section MUST always be present. Where it lives depends on who created the GitHub issue:

| Who created the issue? | Where does `## Fix` go? |
|------------------------|------------------------|
| **sparkling** (us) | In the **issue body** — edit the issue to include `## Fix` |
| **Someone else** | In a **single comment** on the issue — do NOT edit their body |

This rule is absolute. Every linked GitHub issue must have a `## Fix` section visible — either in the body (if we created it) or in exactly one comment (if someone else created it).

### Before creating a new defect, always search first:

```bash
gh issue list --repo ruvnet/claude-flow --search "<keywords>" --limit 10
```

### If an open GitHub issue exists (created by someone else):

Post a single comment with the patch details. Do NOT edit the issue body. Do NOT post multiple comments, closing remarks, or history. One clean comment per defect:

```bash
gh issue comment <NUMBER> --repo ruvnet/claude-flow --body "$(cat <<'EOF'
## Fix

Defect **{PREFIX}-{NNN}** in [claude-flow-patch](https://github.com/sparkling/claude-flow-patch).

**Root cause:** <1-2 sentences explaining why the bug occurs at the code level>

<What the patch does. Be specific. Include a table if multiple ops.>

**Affected versions:** `@claude-flow/cli` 3.1.0-alpha.44 through current

**Related issues:** #NNN, #NNN
EOF
)"
```

### If no GitHub issue exists (we create it):

The `## Fix` section goes directly in the issue body. This is mandatory — sparkling-created issues MUST contain the fix in the body, not in a follow-up comment.

```bash
gh issue create --repo ruvnet/claude-flow \
  --title "Bug: <short description>" \
  --body "$(cat <<'EOF'
## Summary
<1-2 sentences>

## Root Cause
<what's wrong and why>

## Fix
<what the patch does — be specific, include a table if multiple ops>

## Files Affected
- <dist/src/path/to/file.js>

## Affected Versions
`@claude-flow/cli` 3.1.0-alpha.44 through current

## Related Issues
- #NNN — <short description of relationship>
EOF
)"
```

Save the returned GitHub issue number for the defect README.md.

### Comment hygiene:

- One comment per defect, describing the patch. No meta-commentary.
- Every comment/body MUST include affected versions and related issues (use "None" if truly standalone).
- If you need to replace a comment, delete the old one first (`gh api -X DELETE`).
- Do not reference defect history, deletion/restoration, or internal decisions.

## Defect Categories

<!-- GENERATED:defect-tables:begin -->
| Prefix | Category | Count |
|--------|----------|-------|
| CF | Config & Doctor | 9 |
| DM | Daemon & Workers | 6 |
| EM | Embeddings & HNSW | 2 |
| GV | Ghost Vectors | 1 |
| HK | Hooks | 5 |
| HW | Headless Worker | 4 |
| IN | Intelligence | 1 |
| MM | Memory Management | 1 |
| NS | Memory Namespace | 3 |
| RS | ruv-swarm | 1 |
| RV | RuVector Intelligence | 3 |
| SG | Settings Generator | 8 |
| UI | Display & Cosmetic | 2 |
| WM | Wiring / Memory Integration | 6 |
| DOC | Documentation | 1 |

## All 53 Defects

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
| HK-004 | [#1175 hooks_session-start ignores daemon.autoStart from settings.json](https://github.com/ruvnet/claude-flow/issues/1175) | High |
| HK-005 | [#1171 Multiple MCP servers start independent in-process daemons](https://github.com/ruvnet/claude-flow/issues/1171) | Critical |
| HW-001 | [#1111 Headless workers hang — stdin pipe never closed](https://github.com/ruvnet/claude-flow/issues/1111) | Critical |
| HW-002 | [#1112 Headless failures silently swallowed as success](https://github.com/ruvnet/claude-flow/issues/1112) | High |
| HW-003 | [#1113 Worker scheduling intervals too aggressive + settings ignored](https://github.com/ruvnet/claude-flow/issues/1113) | High |
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
| DM-006 | [#1114 No log rotation — logs grow unbounded](https://github.com/ruvnet/claude-flow/issues/1114) | Medium |
| HW-004 | [#1117 runWithTimeout rejects but does not kill child process](https://github.com/ruvnet/claude-flow/issues/1117) | Medium |
| SG-004 | [#1181 init wizard lacks parity with init](https://github.com/ruvnet/claude-flow/issues/1181) | High |
| SG-005 | [#1177 add 'start all' subcommand to start everything at once](https://github.com/ruvnet/claude-flow/issues/1177) | Enhancement |
| SG-006 | [#1184 Wizard captures permissionRequest hook but never assigns it + topology hardcoded](https://github.com/ruvnet/claude-flow/issues/1184) | Medium |
| WM-001 | [#829 Wire @claude-flow/memory HybridBackend into CLI](https://github.com/ruvnet/claude-flow/issues/829) | Critical |
| WM-002 | [#1185 Neural config gating (neural.enabled not consumed at runtime)](https://github.com/ruvnet/claude-flow/issues/1185) | Medium |
| WM-003 | [#1102 Activate AutoMemoryBridge in auto-memory-hook.mjs](https://github.com/ruvnet/claude-flow/issues/1102) | High |
| CF-003 | [#1186 Doctor --install native dependency resolution](https://github.com/ruvnet/claude-flow/issues/1186) | Medium |
| SG-007 | [#1188 --skip-claude / --only-claude mutate shared init options via shallow copy](https://github.com/ruvnet/claude-flow/issues/1188) | Medium |
| WM-004 | [#1190 Source hook silently falls back to JsonFileBackend](https://github.com/ruvnet/claude-flow/issues/1190) | High |
| WM-005 | [#1191 memory-initializer reads config.yaml with hand-rolled regex instead of config.json](https://github.com/ruvnet/claude-flow/issues/1191) | Medium |
| WM-006 | [#1192 intelligence.js reads neural.enabled from config.yaml regex instead of config.json](https://github.com/ruvnet/claude-flow/issues/1192) | Medium |
| CF-004 | [#1193 config get/export uses hand-rolled YAML parser instead of config.json](https://github.com/ruvnet/claude-flow/issues/1193) | Medium |
| CF-005 | [#1194 Doctor checkMemoryBackend reads env var + config.yaml instead of config.json](https://github.com/ruvnet/claude-flow/issues/1194) | Medium |
| SG-008 | [#1195 init should generate .claude-flow/config.json (not config.yaml)](https://github.com/ruvnet/claude-flow/issues/1195) | Enhancement |
| CF-006 | [#1197 start.js uses hand-rolled YAML parser instead of config.json](https://github.com/ruvnet/claude-flow/issues/1197) | Medium |
| CF-007 | [#1198 status.js isInitialized checks config.yaml instead of config.json](https://github.com/ruvnet/claude-flow/issues/1198) | Medium |
| CF-008 | [#1199 init.js isInitialized and display strings reference config.yaml](https://github.com/ruvnet/claude-flow/issues/1199) | Medium |
| DOC-001 | [#1201 Update upstream README.md to match patched CLI behavior](https://github.com/ruvnet/claude-flow/issues/1201) | Enhancement |
| SG-009 | [#1202 Remove --v3-mode from swarm init, make v3 the default](https://github.com/ruvnet/claude-flow/issues/1202) | High |
| CF-009 | [#1203 Upgrade MINIMAL init preset to v3 runtime defaults](https://github.com/ruvnet/claude-flow/issues/1203) | High |
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
| `INIT_CMD` | `commands/init.js` | @claude-flow/cli |
| `START_CMD` | `commands/start.js` | @claude-flow/cli |
| `CMDS_INDEX` | `commands/index.js` | @claude-flow/cli |
| `ruvector_cli` | `bin/cli.js` | ruvector |
| `ruv_swarm_root` | (package root) | ruv-swarm |

To target a new file, add a variable to `lib/common.py` following the existing pattern.

### Step 6: Update docs and test

```bash
# Regenerate all documentation from dynamic discovery
npm run preflight

# Apply -- should show "Applied: ..."
bash patch-all.sh --global

# Idempotency -- should show "0 applied, N already present"
bash patch-all.sh --global

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
- [ ] `npm run preflight` regenerates all doc tables
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
4. Run `npm run preflight` to regenerate all documentation.

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
| Error handling | `05-error-handling.test.mjs` | Empty `BASE`, `/dev/null`, nonexistent dir, unknown options |
| Discovery | `06-discovery.test.mjs` | Direct/umbrella/multi-install discovery, deduplication, npx cache roots |

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
# Apply all patches (default: --global)
bash patch-all.sh

# Patch only the npx cache
bash patch-all.sh --global

# Patch a specific project's node_modules
bash patch-all.sh --target /path/to/project

# Patch both
bash patch-all.sh --global --target /path/to/project

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

### Target Options

| Flag | Target | When to use |
|------|--------|-------------|
| (none) | Global npx cache (default) | Most common — patches the npx cache |
| `--global` | `~/.npm/_npx/*/node_modules/` | Explicit global-only |
| `--target <dir>` | `<dir>/node_modules/` | Project with a local install |
| `--global --target <dir>` | Both locations | Covers both invocation paths |

`npx @claude-flow/cli` uses local `node_modules` if present, otherwise the global npx cache.

## Dependency Order

Execution order is controlled by the 3-digit numeric prefix on each directory name.
`patch-all.sh` globs `patch/*/fix.py` which sorts lexicographically, so numeric prefixes
execute in the correct order automatically.

Three dependency chains exist:

| Chain | Directories | Reason |
|-------|-------------|--------|
| IN-001 -> SG-003 | `170-IN-001-*` before `270-SG-003-*` | SG-003's `old_string` contains code introduced by IN-001 |
| NS-001 -> NS-002 -> NS-003 | `190-NS-001-*` before `200-NS-002-*` before `210-NS-003-*` | Sequential namespace fixes |
| WM-003 -> WM-004 | `370-WM-003-*` before `390-WM-004-*` | WM-004's `old_string` matches code written by WM-003 (doImport/doSync HybridBackend stubs) |

All other patches are independent.

### Absorbed Patches

Three patches have been absorbed into their parent patches to eliminate dead YAML
regex code that was immediately replaced by later config.json readers:

| Absorbed | Into | Reason |
|----------|------|--------|
| WM-005 | WM-001 | WM-001a now writes config.json reader directly |
| WM-006 | WM-002 | WM-002c now writes config.json reader directly; WM-002d deleted (regex fix for removed code) |
| CF-005 | CF-003 | CF-003a now writes config.json reader and updated error messages directly |

These patches retain their directories and README files for GitHub issue tracking
but their `fix.py` files are empty (no ops) and sentinels are set to `none`.

## Preflight & Pre-Commit Hook

A git pre-commit hook at `hooks/pre-commit` runs automatically on every commit. It calls `npm run preflight:check` (read-only) and `npm test`. If anything is stale or tests fail, the commit is blocked.

**Setup** (one-time, already done for this clone):
```bash
git config core.hooksPath hooks
```

**Before staging**, run:
```bash
npm run preflight    # Syncs doc tables, defect counts, version strings, config
npm test             # Runs all tests
```

Then `git add -u` to stage the regenerated files.

**What `preflight` syncs**:
- Defect tables in README.md, CLAUDE.md, npm/README.md (from `patch/*/README.md`)
- Defect counts in `npm/config.json` (from discovery)
- `npm/config.json` version.current (from `package.json`)
- Upstream baseline version in prose (from `npm/config.json` targets)

Manual edits to generated sections (`<!-- GENERATED:*:begin/end -->`) will be overwritten.

## Auto-Reapply on Update (Sentinel Watch)

When `npx` fetches a new version of `@claude-flow/cli`, `ruvector`, or `ruv-swarm`, it replaces cached files and wipes all patches. Projects using these patches need a sentinel to detect and auto-reapply.

### Claude Code Hook (recommended for AI agents)

Add to the project's `.claude/settings.json`:

```jsonc
{
  "hooks": {
    "session_start": [
      {
        "command": "bash /absolute/path/to/claude-flow-patch/check-patches.sh --global",
        "timeout": 30000
      }
    ]
  }
}
```

For projects with a local install, use `--global --target .` instead.

### Cron (headless environments)

```bash
*/5 * * * * bash /path/to/claude-flow-patch/check-patches.sh --global >> /tmp/patch-sentinel.log 2>&1
```

### npm postinstall (project dependency)

```jsonc
{
  "scripts": {
    "postinstall": "npx --yes @sparkleideas/claude-flow-patch --target ."
  }
}
```

### How it works

`check-patches.sh` reads each `patch/*/sentinel` file and verifies the patched strings exist in the target files. If any sentinel fails, it auto-runs `patch-all.sh` and restarts the daemon. The check is idempotent and takes ~2s when patches are intact.

## Key Design Decisions

- **Idempotent**: `patch()` checks if `new` string is already present before replacing.
- **Non-destructive**: patches only modify the npx cache, never the npm registry package.
- **Platform-aware**: DM-003 is macOS-only (auto-skipped on Linux).
- **Sentinel-guarded**: `check-patches.sh` detects cache wipes and auto-reapplies.
