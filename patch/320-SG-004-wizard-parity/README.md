# SG-004: init wizard lacks parity with init

**Severity**: High
**GitHub**: [#1181](https://github.com/ruvnet/claude-flow/issues/1181)

## Root Cause

The `wizardCommand.action` in `commands/init.js` was implemented as a
standalone code path that diverges from the parent `initAction`. It skips the
already-initialized guard, ignores `--force`, `--start-all`, `--start-daemon`,
`--codex`, and `--dual` flags, and never shows "Next steps" hints. The wizard
is also only reachable as a subcommand of `init` with no `options` array, so
the parser cannot validate flags for the wizard context.

## Fix

Ten ops bring the wizard to full parity with `init` and promote it to a
top-level command (`claude-flow wizard`):

| Op | What it does |
|----|-------------|
| SG-004a | Adds the already-initialized guard before prompts + passes `--force` to options |
| SG-004b | Adds `--codex`/`--dual` handling after executeInit succeeds |
| SG-004c | Adds `--start-all`/`--start-daemon` service startup + "Next steps" hints |
| SG-004d | Fixes catch block — catches errors cleanly instead of re-throwing |
| SG-004e | Exports `wizardCommand` from init.js, adds `options` + `examples` arrays |
| SG-004f | Imports `wizardCommand` in the command registry (`commands/index.js`) |
| SG-004g | Adds wizard to `commandLoaders` for lazy-loading |
| SG-004h | Pre-populates wizard in the loaded commands cache |
| SG-004i | Adds `wizardCommand` to the `commands` array (parser registration) |
| SG-004j | Adds `wizardCommand` to `commandsByCategory.primary` for help display |

## Files Patched

- `commands/init.js`
- `commands/index.js`

## Ops

10 ops in fix.py
