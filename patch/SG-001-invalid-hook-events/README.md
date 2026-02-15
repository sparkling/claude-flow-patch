# SG-001: Settings generator outputs invalid Claude Code hook events

**Severity**: High
**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)
**Introduced**: Commit `94c32ea` (Feb 12, 2026) in PR #1128

## Root Cause

PR #1128 added Agent Teams hooks to the settings generator, using `TeammateIdle` and `TaskCompleted` as hook event names. However, these are **not valid Claude Code hook events**.

Claude Code only supports:
```
PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit,
SessionStart, SessionEnd, Stop, SubagentStart, SubagentStop, PreCompact,
PermissionRequest
```

## Intent

The author wanted to integrate with Claude Code's experimental Agent Teams feature (Opus 4.6):
- `TeammateIdle` → Auto-assign pending tasks when a teammate becomes idle
- `TaskCompleted` → Train neural patterns when tasks complete

## Fix Strategy

Map the intent to valid hooks:

| Invalid Hook | Valid Mapping | Notes |
|--------------|---------------|-------|
| `TaskCompleted` | `SubagentStop` | Fires when subagent finishes - close enough |
| `TeammateIdle` | `SubagentStop` | Call opportunistically when any agent stops |

The patch removes the invalid hook blocks and enhances `SubagentStop` to call both:
- `post-task` (existing)
- `teammate-idle` (for auto-assignment)

## Files Patched

- `init/settings-generator.js`

## Ops

3 ops in fix.py:
1. Remove `TeammateIdle` block
2. Remove `TaskCompleted` block
3. Add `teammate-idle` command to `SubagentStop`
