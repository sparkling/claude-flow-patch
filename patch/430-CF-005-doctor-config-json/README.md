# CF-005: Doctor checkMemoryBackend reads env var + config.yaml instead of config.json

**Severity**: Medium
**GitHub**: [#1194](https://github.com/ruvnet/claude-flow/issues/1194)

## Root Cause

`checkMemoryBackend()` in `doctor.js` reads the configured backend from `CLAUDE_FLOW_MEMORY_BACKEND` env var first, then falls back to a YAML regex parser. The env var override is undocumented. Error messages reference `config.yaml`.

```javascript
let configuredBackend = 'hybrid';
if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
    configuredBackend = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
} else {
    const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    // ... regex ...
}
```

## Fix

Replace the env var + YAML regex block with a config.json reader. Update error/fix messages to reference config.json.

## Files Patched

- `commands/doctor.js`

## Ops

3 ops in fix.py
