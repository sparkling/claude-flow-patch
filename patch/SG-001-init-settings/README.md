# SG-001: Init generates invalid hook events

**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)

## Problem

The `init` command generates `settings.json` with invalid Claude Code hook events:
- `TeammateIdle` — not a valid hook event
- `TaskCompleted` — not a valid hook event

Claude Code errors when it encounters these hooks in the generated settings.

Additionally, hook paths use relative `.claude/helpers/` which breaks when running
Claude from a subdirectory (e.g., `scripts/my-app/`).

## Fix

Replace the invalid hooks with `SubagentStop`, which:
- IS a valid Claude Code hook event
- Fires when a subagent completes (the right time for post-task processing)
- Preserves the intended functionality (teammate-idle + task completion)

Also fixes overly broad permission glob patterns and uses `$CLAUDE_PROJECT_DIR`
(Claude Code's built-in env var) for hook paths so they work from any directory.

## Patches

| ID | Description |
|----|-------------|
| SG-001a | Replace `TeammateIdle` + `TaskCompleted` with `SubagentStop` |
| SG-001b | Fix `@claude-flow` permission pattern |
| SG-001c | Fix `claude-flow` permission pattern |
| SG-001d | Use `$CLAUDE_PROJECT_DIR` for hook paths (works from subdirectories) |
| SG-001e | Add `$CLAUDE_PROJECT_DIR` to permissions |

## Files

- `init/settings-generator.js`
