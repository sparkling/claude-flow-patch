# SG-001: Init generates invalid settings

**Severity**: High
**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)

## Root Cause

1. **Invalid hook events**: `TeammateIdle` and `TaskCompleted` are not valid Claude Code hooks
2. **Overly broad permissions**: Glob patterns like `Bash(npx @claude-flow*)` match unintended commands
3. **Relative hook paths**: `node .claude/helpers/` breaks when running from subdirectories

## Fix

Replace invalid hooks with `SubagentStop` (valid event), fix permission patterns, and use
`$CLAUDE_PROJECT_DIR` (Claude Code's built-in env var) for all hook paths.

## Files Patched

- `init/settings-generator.js`

## Ops

3 ops in fix.py (SG-001a: replace invalid hooks, SG-001b: fix permissions, SG-001c: CLAUDE_PROJECT_DIR paths)
