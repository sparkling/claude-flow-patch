# HK-001: MCP hook handlers are stubs that don't persist data

**Severity**: High
**GitHub**: [#1058](https://github.com/ruvnet/claude-flow/issues/1058)

## Root Cause

Three MCP hook handlers in `hooks-tools.js` return success responses but **never persist any data**:

1. **`hooksPostEdit`** — Returns `{recorded: true}` but has no database INSERT
2. **`hooksPostCommand`** — Same, claims recorded but stores nothing
3. **`hooksPostTask`** — Returns fake random duration and hardcoded pattern counts

## Evidence

### hooksPostEdit (line 512)
```javascript
handler: async (params) => {
    const filePath = params.filePath;
    const success = params.success !== false;
    return {
        recorded: true,  // ← LIE - nothing is recorded!
        filePath,
        success,
        timestamp: new Date().toISOString(),
        learningUpdate: success ? 'pattern_reinforced' : 'pattern_adjusted',
    };
},
```

### hooksPostCommand (line 569)
```javascript
handler: async (params) => {
    const command = params.command;
    const exitCode = params.exitCode || 0;
    return {
        recorded: true,  // ← LIE - nothing is recorded!
        command,
        exitCode,
        success: exitCode === 0,
        timestamp: new Date().toISOString(),
    };
},
```

### hooksPostTask (line 886)
```javascript
handler: async (params) => {
    const taskId = params.taskId;
    const success = params.success !== false;
    const quality = params.quality || (success ? 0.85 : 0.3);
    return {
        taskId,
        success,
        duration: Math.floor(Math.random() * 300) + 60,  // ← FAKE random!
        learningUpdates: {
            patternsUpdated: success ? 2 : 1,  // ← FAKE - nothing stored
            newPatterns: success ? 1 : 0,
            trajectoryId: `traj-${Date.now()}`,
        },
        quality,
        timestamp: new Date().toISOString(),
    };
},
```

## The Store Function Exists

The file already has `getRealStoreFunction()` (line 23) that's used by other handlers:
- `hooks_intelligence_trajectory-end` (line 1562) — correctly persists
- `hooks_intelligence_pattern-store` (line 1691) — correctly persists

The three broken handlers just don't call it.

## Fix

Patch each handler to call `getRealStoreFunction()` and persist to appropriate namespaces:
- `hooksPostEdit` → namespace: `edits`
- `hooksPostCommand` → namespace: `commands`
- `hooksPostTask` → namespace: `tasks`

## Impact

- **Edit patterns never stored** — can't learn from file edits
- **Command history lost** — can't learn from command outcomes
- **Task outcomes not tracked** — SONA learning has no data
- **Misleading metrics** — statusline shows fake pattern counts

## Files to Patch

- `mcp-tools/hooks-tools.js` — Three handler functions

## Status

- [x] GitHub issue exists (#1058)
- [ ] Fix implemented
- [ ] Patch tested
