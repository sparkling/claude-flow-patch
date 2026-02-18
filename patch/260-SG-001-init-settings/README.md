# SG-001: Init generates invalid settings

**Severity**: High
**GitHub**: [#1150](https://github.com/ruvnet/claude-flow/issues/1150)

## Root Cause

1. **Invalid hook events**: `TeammateIdle` and `TaskCompleted` are not valid Claude Code hooks
2. **Overly broad permissions**: Glob patterns like `Bash(npx @claude-flow*)` match unintended commands
3. **Relative hook paths**: `node .claude/helpers/` breaks when running from subdirectories
4. **Phantom statusLine config**: `--minimal` and `init hooks` emit `statusLine` config
   referencing `statusline.cjs` but the file is never generated (`components.statusline: false`)
5. **MINIMAL statusline inconsistency**: `MINIMAL_INIT_OPTIONS` inherits
   `statusline.enabled: true` from DEFAULT but sets `components.statusline: false`

## Fix

Replace invalid hooks with `SubagentStop` (valid event), fix permission patterns, use
`$CLAUDE_PROJECT_DIR` for all hook paths, gate statusLine config emission on
`components.statusline`, and override `statusline.enabled` to `false` in MINIMAL preset.

## Files Patched

- `init/settings-generator.js`
- `init/types.js`

## Ops

5 ops in fix.py (SG-001a: replace invalid hooks, SG-001b: fix permissions, SG-001c: CLAUDE_PROJECT_DIR paths, SG-001d: gate statusLine on component flag, SG-001e: MINIMAL statusline.enabled=false)
