# Init Helpers Fix Plan

Comprehensive plan documenting all analysis and fixes for the init system's
`.js`/`.cjs` extension mismatch and missing helpers across code paths.

---

## Problem Statement

When `package.json` has `"type": "module"`, Node.js treats `.js` files as ESM.
`require()` (CommonJS) cannot load ESM `.js` files. The init system's
`hook-handler.cjs` uses `safeRequire()` to load `router`, `session`, and
`memory` helpers, but:

1. The require calls referenced `.js` extensions instead of `.cjs`
2. `safeRequire()` silently returns `null` on failure, hiding the mismatch
3. Multiple init code paths skip helper generation entirely

Result: "Router not available, using default routing" on every hook invocation.

---

## Root Cause Chain

```
"type": "module" in package.json
  -> require('router.js') fails (Node treats .js as ESM)
    -> safeRequire() returns null silently
      -> "Router not available, using default routing"
```

---

## Defects Fixed

### 1. IN-001 fix.py (pre-existing) -- Comment fix

**File**: `patch/IN-001-intelligence-stub/fix.py`
**GitHub**: [#1154](https://github.com/ruvnet/claude-flow/issues/1154)

**Problem**: Op 2 (`IN-001b`) had an `old_string` that matched `.js` keys in
upstream `executor.js`, and the `new_string` correctly changed them to `.cjs`.
However, during an earlier fix attempt, the `old_string` was accidentally
changed to `.cjs` -- which doesn't match upstream, causing a WARN on apply.

**Fix applied**: Reverted `old_string` back to upstream's `.js` keys while
keeping `new_string` with `.cjs` keys. The correct transformation is:

| old_string (upstream) | new_string (patched) |
|-----------------------|----------------------|
| `'session.js': generateSessionManager()` | `'session.cjs': generateSessionManager()` |
| `'router.js': generateAgentRouter()` | `'router.cjs': generateAgentRouter()` |
| `'memory.js': generateMemoryHelper()` | `'memory.cjs': generateMemoryHelper()` |

**Lesson**: `patch()` does exact string matching. The `old_string` must match
what's actually in the upstream file, not what we want it to be.

---

### 2. SG-002 fix.py & README (pre-existing) -- Comment corrections

**File**: `patch/SG-002-helpers-compat-copies/fix.py` and `README.md`
**GitHub**: [#1153](https://github.com/ruvnet/claude-flow/issues/1153)

**Problem**: Comments in fix.py said `hook-handler.cjs` requires `router.js`
(with `.js` extension), but the actual source-shipped `hook-handler.cjs`
already uses `router.cjs`. The comments were stale/misleading.

**Fix applied**:
- fix.py comment: Changed `safeRequire('router.js')` -> `safeRequire('router.cjs')`
- README.md: Updated root cause description to reflect `.cjs` requires

---

### 3. SG-003 -- New patch (created)

**File**: `patch/SG-003-init-helpers-all-paths/fix.py`
**GitHub**: [#1169](https://github.com/ruvnet/claude-flow/issues/1169)
**Severity**: Critical

This is the main new patch addressing 7 bugs across the init system.

---

## Comprehensive Code Path Analysis

### All 11 sections of executeInit()

| # | Section | Controlled by | Line |
|---|---------|--------------|------|
| 1 | `createDirectories()` | always runs | 158 |
| 2 | `writeSettings()` | `components.settings` | 160 |
| 3 | `writeMCPConfig()` | `components.mcp` | 164 |
| 4 | `copySkills()` | `components.skills` | 168 |
| 5 | `copyCommands()` | `components.commands` | 172 |
| 6 | `copyAgents()` | `components.agents` | 176 |
| 7 | `writeHelpers()` | `components.helpers` | 180 |
| 7b | SG-003 critical helpers fallback | `!helpers && settings` | 185 |
| 8 | `writeStatusline()` | `components.statusline` | 202 |
| 9 | ~~SG-002 compat sweep~~ (removed) | ~~always runs~~ | ~~206~~ |
| 10 | `writeRuntimeConfig()` | `components.runtime` | 221 |
| 10b | `writeInitialMetrics()` | `components.statusline` | 225 |
| 11 | `writeClaudeMd()` | `components.claudeMd` | 229 |

### Complete init path matrix (post-patch)

| Path | Entry | dirs | settings | mcp | skills | cmds | agents | helpers | statusline | compat | runtime | metrics | CLAUDE.md |
|------|-------|:----:|:--------:|:---:|:------:|:----:|:------:|:-------:|:----------:|:------:|:-------:|:-------:|:---------:|
| **default** | executeInit(DEFAULT) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| **--dual** | SG-003 executeInit | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Y | - |
| **--codex** | initCodexAction only | - | - | - | - | - | - | - | - | - | - | - | - |
| **--minimal** | executeInit(MINIMAL) | Y | Y | Y | Y | - | - | - | - | Y | Y | - | Y |
| **--full** | executeInit(FULL) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| **wizard** | executeInit(custom) | Y | * | * | * | * | * | * | * | Y | * | * | * |
| **--skip-claude** | executeInit(none) | Y | - | - | - | - | - | - | - | Y | Y | - | - |
| **--only-claude** | executeInit(no runtime) | Y | Y | Y | Y | Y | Y | Y | Y | Y | - | Y | Y |
| **hooks** | executeInit(hooks only) | Y | Y | - | - | - | - | - | - | Y | - | - | - |
| **skills** | executeInit(skills only) | Y | - | - | Y | - | - | - | - | Y | - | - | - |
| **upgrade** | executeUpgrade() | (separate logic -- see below) |

`*` = user-selected in wizard, `Y` = generated, `-` = skipped

### Entry point flow (post-patch)

```
commands/init.js
  ├─ codexMode || dualMode
  │   ├─ initCodexAction() -> AGENTS.md, .agents/, .codex/
  │   └─ [SG-003a] if dualMode -> executeInit(all components except runtime+claudeMd)
  ├─ upgradeMode -> executeUpgrade()
  ├─ wizardMode -> executeWizard() -> executeInit()
  └─ default -> executeInit()

init/executor.js executeInit()
  ├─ createDirectories()
  ├─ components.settings? -> writeSettings()
  ├─ components.mcp? -> writeMCPConfig()
  ├─ components.skills? -> copySkills()
  ├─ components.commands? -> copyCommands()
  ├─ components.agents? -> copyAgents()
  ├─ components.helpers? -> writeHelpers()
  │   ├─ findSourceHelpersDir() found? -> copy from source
  │   └─ not found? -> generate fallback (IN-001: resolve intelligence)
  ├─ [SG-003b] !helpers && settings? -> generate hook-handler.cjs + auto-memory-hook.mjs
  ├─ components.statusline? -> writeStatusline()
  ├─ ~~[SG-002] compat sweep~~ (removed — no code references .js after SG-003d-i)
  ├─ components.runtime? -> writeRuntimeConfig()
  ├─ components.statusline? -> writeInitialMetrics()
  └─ components.claudeMd? -> writeClaudeMd()

init/executor.js executeUpgrade()
  ├─ findSourceHelpersDir() found?
  │   ├─ copy criticalHelpers [SG-003c: 6 files including router/session/memory]
  │   └─ copy statusline.cjs
  ├─ findSourceHelpersDir() not found?
  │   ├─ generate fallback (IN-001a: resolve intelligence)
  │   └─ [SG-003j] generatedCritical has 6 files (router/session/memory added)
  ├─ create missing metrics files
  └─ upgradeSettings? -> mergeSettingsForUpgrade()
```

---

## 11 Bugs Fixed (confirmed)

1. **`init --dual` bypasses executeInit entirely** (init.js:151-152)
   - Fixed by SG-003a: calls executeInit after codex init

2. **`init --minimal` generates settings without helpers** (executor.js)
   - Fixed by SG-003b: generates critical helpers when settings=true, helpers=false

3. **`init hooks` generates settings without helpers** (executor.js)
   - Fixed by SG-003b (same fix as --minimal)

4. **`init upgrade` only restores 3 of 8 helpers** (executor.js)
   - Fixed by SG-003c: expanded criticalHelpers to 6 (added router/session/memory)

5. **~~Upgrade doesn't run SG-002 compat sweep~~** (executor.js)
   - ~~Mitigated by SG-003g/h/i~~ Resolved: SG-002 removed entirely. No code references `.js` after SG-003d-i.

6. **Fallback writeHelpers uses `.js` extensions for router/session/memory** (executor.js)
   - Fixed by IN-001b: new_string changes keys to .cjs

7. **Generated hook-handler.cjs hardcodes `.js` requires** (helpers-generator.js)
   - Fixed by SG-003d/e/f (generated) and SG-003g/h/i (source-shipped)

8. **Upgrade fallback `generatedCritical` missing router/session/memory** (executor.js)
   - Fixed by SG-003j: added 3 generator calls to the fallback dict

9. **`--minimal`/hooks emit statusLine config for non-existent file** (types.js + settings-generator.js)
   - Root fix: SG-001e overrides `statusline.enabled: false` in MINIMAL_INIT_OPTIONS
   - Defense-in-depth: SG-001d guards emission on `components.statusline` in settings-generator.js

10. **`--dual` doesn't create Claude Code skills/commands/agents** (init.js)
    - Fixed by SG-003a modification: `skills: true, commands: true, agents: true`
    - Transition: SG-003l patches caches with old SG-003a (skills: false -> true)

11. **~~`.js` compat copies needed~~** — SG-002 retired
    - Analysis confirmed: after SG-003d-i, all `require()` calls use `.cjs`. No code references `.js`.
    - SG-002 patch deleted. SG-003k (compat sweep in upgrade) also removed.

---

## SG-003 Patch Operations

### Op 1: `SG-003a` -- `--dual` also generates Claude Code infrastructure

**Target**: `commands/init.js` (INIT_CMD)
**Type**: `patch()` (single replacement)

After `initCodexAction()` succeeds for dual mode, also call `executeInit()`
with helpers + settings + statusline components. The codex result is still
returned (the codex init is the primary action).

```
components: {
    settings: true, helpers: true, statusline: true,
    skills: true, commands: true, agents: true,
    mcp: true, runtime: false, claudeMd: false,
}
```

### Op 2: `SG-003b` -- Generate critical helpers when settings references them

**Target**: `init/executor.js` (EXECUTOR)
**Type**: `patch()` (single replacement)

When `components.settings=true` but `components.helpers=false` (--minimal,
init hooks), generate the minimal helpers that settings.json hooks reference:
- `hook-handler.cjs`
- `auto-memory-hook.mjs`

### Op 3: `SG-003c` -- Expand upgrade criticalHelpers list

**Target**: `init/executor.js` (EXECUTOR)
**Type**: `patch()` (single replacement)

Adds `router.cjs`, `session.cjs`, `memory.cjs` to the criticalHelpers array
in `executeUpgrade()` (source-found branch only).

### Op 4: `SG-003d/e/f` -- Fix generated hook-handler requires

**Target**: `init/helpers-generator.js` (HELPERS_GEN)
**Type**: `patch_all()` (all occurrences)

Changes the fallback-generated hook-handler.cjs template:
- `router.js` -> `router.cjs`
- `session.js` -> `session.cjs`
- `memory.js` -> `memory.cjs`

### Op 5: `SG-003g/h/i` -- Fix source-shipped hook-handler requires

**Target**: `<pkg-root>/.claude/helpers/hook-handler.cjs` (SRC_HOOK_HANDLER)
**Type**: `patch_all()` (all occurrences)

The source-shipped hook-handler.cjs is copied verbatim by `writeHelpers()`
when `findSourceHelpersDir()` succeeds. It had the same `.js` require bug:
- `router.js` -> `router.cjs`
- `session.js` -> `session.cjs`
- `memory.js` -> `memory.cjs`

This was the final fix needed -- Op 4 only fixed the fallback generator, not
the source copy that's used when source helpers are found.

---

## Patch Ordering Analysis

**All 3 patches (IN-001, SG-001, SG-003) are fully order-independent.** (SG-002 removed.)

Pairwise conflict analysis on all ops targeting `executor.js`:

| Op | Function | Location |
|----|----------|----------|
| IN-001a | `executeUpgrade()` | `else` fallback block |
| IN-001b | `writeHelpers()` | fallback helpers dict |
| SG-003b | `executeInit()` | helpers `if` block (before statusline) |
| SG-003c | `executeUpgrade()` | `criticalHelpers` array line |
| SG-003j | `executeUpgrade()` | `generatedCritical` dict (source-not-found fallback) |

No patch's `new_string` modifies text that another patch's `old_string` needs
to match. Each targets a disjoint text region in a different function. This is
consistent with CLAUDE.md which states only NS-001 -> NS-002 -> NS-003 require
ordering. All other patches are independent.

---

## Merge Analysis

| Candidate | Recommendation | Rationale |
|-----------|:-:|-----------|
| ~~SG-002 + SG-003~~ | **SG-002 removed** | SG-002 (.js compat copies) was unnecessary after SG-003d-i fixed all requires to .cjs. No code references .js extensions. |
| IN-001b keys + SG-003 d-i requires | **Keep separate** | Different issues (#1154 vs #1169). IN-001b's .cjs key fix is incidental to the intelligence stub fix -- extracting it would break IN-001's old_string matching. Logically complementary: one fixes filenames written, the other fixes filenames loaded. |
| SG-001 + SG-003 | **Keep separate** | Different issues (#1150 vs #1169). SG-001 = invalid settings content + statusline config. SG-003 = missing code paths + wrong requires. Distinct root causes. |

**Conclusion**: Current 3-patch structure (IN-001, SG-001, SG-003) is correct. Each
addresses a genuinely distinct root cause, follows the one-defect-per-issue rule,
and has no ordering dependencies.

---

## Hook-Handler Verification (all copies)

| Location | router | session | memory | Status |
|----------|:------:|:-------:|:------:|--------|
| Project `.claude/helpers/hook-handler.cjs` | .cjs | .cjs | .cjs | FIXED |
| Scaffold `.claude/helpers/hook-handler.cjs` | .cjs | .cjs | .cjs | FIXED |
| npm cache `@claude-flow/cli/.claude/helpers/hook-handler.cjs` | .cjs | .cjs | .cjs | FIXED |
| npm cache `claude-flow/.claude/helpers/hook-handler.cjs` | .cjs | .cjs | .cjs | FIXED |
| Generated fallback (`helpers-generator.js`) | .cjs | .cjs | .cjs | FIXED |

5/5 copies verified. Older stale npm cache entries (pre-patch) are not a concern
as `patch-all.sh` targets the active cache.

---

## New Issues Found (post-fix analysis)

### Issue D (Medium): FIXED -- SG-003j

Upgrade fallback `generatedCritical` was missing router/session/memory.
Fixed by SG-003j: added `generateAgentRouter()`, `generateSessionManager()`,
`generateMemoryHelper()` to the fallback dict.

### Issue A (Low): FIXED -- SG-001d + SG-001e

Root cause: `MINIMAL_INIT_OPTIONS` inherits `statusline.enabled: true` from
DEFAULT via spread but sets `components.statusline: false`. Settings-generator
emits statusLine config for a file that won't exist.

**Root fix** (SG-001e): Override `statusline.enabled: false` in MINIMAL_INIT_OPTIONS (types.js).
**Defense-in-depth** (SG-001d): Guard emission on `components.statusline` in settings-generator.js.

### Issue B (Low): RESOLVED -- SG-002 removed

Analysis confirmed no code references `.js` extensions after SG-003d-i fixed all
`require()` calls to `.cjs`. SG-002 patch deleted entirely. SG-003k (compat sweep
in upgrade) also removed.

### Issue C (Low): FIXED -- SG-003a modified + SG-003l transition

`--dual` now passes `skills: true, commands: true, agents: true` to create full
Claude Code infrastructure. SG-003l handles caches with old SG-003a already applied.

---

## Infrastructure Changes

### lib/common.py

Two new path variables added:

```python
INIT_CMD = commands + "/init.js" if commands else ""

_pkg_root = os.path.dirname(os.path.dirname(base)) if base else ""
SRC_HOOK_HANDLER = os.path.join(_pkg_root, ".claude", "helpers", "hook-handler.cjs") if _pkg_root else ""
```

### Test fixtures added/updated

| Fixture | Change |
|---------|--------|
| `tests/fixtures/cli/dist/src/commands/init.js` | NEW -- codex/dual early return pattern |
| `tests/fixtures/cli/dist/src/init/executor.js` | Added helpers guard and criticalHelpers patterns |
| `tests/fixtures/cli/dist/src/init/helpers-generator.js` | Added router.js/session.js/memory.js requires |

### Test entries added

| Test file | Entries added |
|-----------|---------------|
| `03-patch-apply.test.mjs` | 3 entries (init.js, executor.js, helpers-generator.js) |
| `04-idempotency.test.mjs` | 3 entries (same files) |

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` | 54/54 pass |
| `bash patch-all.sh --global` (fresh) | 93 applied, 1 pre-existing WARN (IN-001a) |
| `bash patch-all.sh --global` (repeat) | 0 applied, 93 already present |
| `bash check-patches.sh` | All sentinels OK |
| `npm run update-docs` | Docs up to date |
| `npx @claude-flow/cli init --dual --force` | All helpers generated, routing works |

---

## Remaining Tasks

- [x] Create GitHub issue for SG-003 -> [#1169](https://github.com/ruvnet/claude-flow/issues/1169)
- [x] Update SG-003 README.md and fix.py with issue number
- [x] Post patch comment to GitHub issue
- [x] Re-run `npm run update-docs` after issue number update
- [x] Swarm analysis: ordering, merge candidates, hook-handler verification
- [x] Deep code path analysis: all 11 executeInit sections across all paths
- [x] Fix Issue D: SG-003j -- upgrade fallback generates router/session/memory
- [x] Fix Issue A: SG-001d (defense-in-depth) + SG-001e (root cause in types.js)
- [x] Fix Issue B: SG-002 removed entirely (no code uses .js extensions)
- [x] Fix Issue C: SG-003a modified (skills/commands/agents: true) + SG-003l transition
- [x] Update GitHub issues #1150 and #1169 with all changes
- [ ] Commit all changes to patch repo

---

## Timeline

1. **Initial discovery**: `hook-handler.cjs` requires `.js` but project has `"type":"module"`
2. **Quick fix**: Copied `.js` -> `.cjs` in project's `.claude/helpers/`
3. **IN-001 fix.py update**: Changed new_string keys to `.cjs` (accidentally broke old_string)
4. **SG-002 comment fix**: Updated stale comments from `.js` to `.cjs`
5. **IN-001b revert**: Fixed old_string back to upstream's `.js` keys
6. **Swarm analysis (round 1)**: 4 agents mapped all init code paths, identified 7 bugs
7. **SG-003 creation**: Ops 1-3 (init.js + executor.js), sentinel, README, fixtures, tests
8. **SG-003 d-f**: Fixed generated hook-handler requires in helpers-generator.js
9. **SG-003 g-i**: Fixed source-shipped hook-handler.cjs requires (final fix)
10. **End-to-end verification**: `init --dual --force` produces working routing
11. **GitHub issue created**: [#1169](https://github.com/ruvnet/claude-flow/issues/1169)
12. **Swarm analysis (round 2)**: 4 agents -- ordering deps, code path verification, hook-handler sweep, merge analysis
13. **Deep code path analysis**: All 11 executeInit sections mapped across all entry points
14. **New issues identified**: D (upgrade fallback), A (statusLine config), B (upgrade compat sweep), C (dual skills)
15. **Issue D fixed**: SG-003j -- upgrade fallback `generatedCritical` includes all 6 helpers
16. **Issue A fixed properly**: SG-001e (root cause in types.js) + SG-001d (defense-in-depth)
17. **Issue B resolved**: SG-002 removed entirely -- no code references `.js` after SG-003d-i
18. **Issue C fixed**: SG-003a modified (skills/commands/agents: true) + SG-003l transition
19. **GitHub issues updated**: #1150 (SG-001 5 ops) and #1169 (SG-003 7 ops, SG-002 retired)
