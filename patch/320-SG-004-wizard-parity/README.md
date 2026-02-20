# SG-004: init wizard lacks parity with init

**Severity**: High
**GitHub**: [#1181](https://github.com/ruvnet/claude-flow/issues/1181)

## Root Cause

The `wizardCommand.action` in `commands/init.js` was implemented as a
standalone code path that diverges from the parent `initAction`. It skips the
already-initialized guard, ignores `--force`, `--start-all`, `--start-daemon`,
`--codex`, and `--dual` flags, and never shows "Next steps" hints. The wizard
is conceptually "init with interactive value selection" but behaves as a
completely separate command.

## Fix

Four ops bring the wizard to full parity with `init`:

| Op | What it does |
|----|-------------|
| SG-004a | Adds the already-initialized guard before prompts + passes `--force` to options |
| SG-004b | Adds `--codex`/`--dual` handling after executeInit succeeds |
| SG-004c | Adds `--start-all`/`--start-daemon` service startup + "Next steps" hints |
| SG-004d | Fixes catch block — catches errors cleanly instead of re-throwing |

## Files Patched

- `commands/init.js`

## Ops

4 ops in fix.py
