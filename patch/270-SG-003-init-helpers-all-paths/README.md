# SG-003: Init missing helpers for --dual, --minimal, hooks, and upgrade paths

**Severity**: Critical
**GitHub**: [#1169](https://github.com/ruvnet/claude-flow/issues/1169)

## Root Cause

Multiple `init` code paths generate `settings.json` (which references `hook-handler.cjs`,
`auto-memory-hook.mjs`, `statusline.cjs`) without generating the helper files those hooks need.

| Path | Generates settings? | Generates helpers? | Result |
|------|--------------------|--------------------|--------|
| `init` (default) | YES | YES | OK |
| `init --dual` | NO (bypasses executeInit) | NO | Broken: no Claude infra despite CLAUDE.md |
| `init --codex` | NO (bypasses executeInit) | NO | OK (no Claude Code expected) |
| `init --minimal` | YES | NO (helpers: false) | Broken: dangling settings refs |
| `init hooks` | YES | NO (helpers: false) | Broken: dangling settings refs |
| `init upgrade` | Only with --settings | Partial (3 of 8) | Broken: missing router/session/memory |
| `init wizard` | YES | YES (default) | OK |

Additionally:
- `helpers-generator.js` generates a `hook-handler.cjs` that hardcodes `require('router.js')`
  instead of `require('router.cjs')`, failing when `package.json` has `"type": "module"`.
- `executeUpgrade()` only upgrades 3 critical helpers but `hook-handler.cjs` needs 6.
- `executeUpgrade()` fallback also only generates 3 in `generatedCritical`.

## Fix

7 ops across 4 files:

1. **init.js** — After `--dual` codex init succeeds, call `executeInit()` with
   all components so full Claude Code infrastructure is created.
2. **executor.js** — When `settings` is generated but `helpers` is not, also generate
   the critical helpers that `settings.json` references (fixes `--minimal` and `init hooks`).
3. **executor.js** — Expand `executeUpgrade()` critical helpers list to include `router.cjs`,
   `session.cjs`, `memory.cjs`.
4. **helpers-generator.js** — Fix generated `hook-handler.cjs` to `require('router.cjs')`
   instead of `require('router.js')` (same for session and memory).
5. **hook-handler.cjs** (source template) — Fix source-shipped copy to use `.cjs` requires.
6. **executor.js** — Expand `executeUpgrade()` fallback `generatedCritical` to include
   `router.cjs`, `session.cjs`, `memory.cjs` when source helpers aren't found.
7. **init.js** — Transition op: update `--dual` components from `skills: false` to `true`.

## Files Patched

- `commands/init.js`
- `init/executor.js`
- `init/helpers-generator.js`
- `<pkg-root>/.claude/helpers/hook-handler.cjs` (source template)

## Dependencies

Depends on IN-001 (170) — SG-003's `old_string` contains code introduced by IN-001.

## Ops

7 ops (11 patch calls) in fix.py
