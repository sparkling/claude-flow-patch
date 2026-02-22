# WM-005: memory-initializer reads config.yaml with hand-rolled regex instead of config.json

**Severity**: Medium
**GitHub**: [#1191](https://github.com/ruvnet/claude-flow/issues/1191)
**Status**: Absorbed into WM-001

## Root Cause

`initializeMemoryDatabase()` in `memory-initializer.js` uses a triple-config pattern to resolve `memory.backend`:

```javascript
// WM-001a: Resolve backend choice (env > config.yaml > options > default)
let backendChoice = backend;
if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
    backendChoice = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
}
if (backendChoice === 'hybrid') {
    const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
    // ... hand-rolled regex YAML parser ...
}
```

The env var silently overrides everything, the YAML regex is fragile, and config.yaml disagrees with config.json on edge cases.

## Fix

Absorbed into WM-001: WM-001a now writes the config.json reader directly instead of the YAML regex. The error message references config.json.

## Files Patched

- `memory/memory-initializer.js` (via WM-001)

## Ops

0 ops in fix.py (absorbed)
