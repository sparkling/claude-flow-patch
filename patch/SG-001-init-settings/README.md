# SG-001: Init generates invalid settings

**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)

## Problems

1. **Invalid hook events**: `TeammateIdle` and `TaskCompleted` are not valid Claude Code hooks
2. **Overly broad permissions**: Glob patterns like `Bash(npx @claude-flow*)` match unintended commands
3. **Relative hook paths**: `node .claude/helpers/` breaks when running from subdirectories

## Fix

Replace invalid hooks with `SubagentStop` (valid event), fix permission patterns, and use
`$CLAUDE_PROJECT_DIR` (Claude Code's built-in env var) for all hook paths.

## Patches

| ID | Description |
|----|-------------|
| SG-001a | Replace `TeammateIdle` + `TaskCompleted` with `SubagentStop`, using `$CLAUDE_PROJECT_DIR` paths |
| SG-001b | Fix all permission patterns (narrower globs + `$CLAUDE_PROJECT_DIR`) |
| SG-001c | Catch-all: convert any remaining relative hook paths to `$CLAUDE_PROJECT_DIR` |

## Files

- `init/settings-generator.js`
