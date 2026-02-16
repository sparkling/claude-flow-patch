# MM-001: memory-initializer.js ignores persistPath config, hardcodes .swarm/

**Severity**: High
**GitHub**: [#1152](https://github.com/ruvnet/claude-flow/issues/1152)

## Root Cause

`memory-initializer.js` hardcodes all storage paths to `.swarm/` directory:

```javascript
const swarmDir = path.join(process.cwd(), '.swarm');
const hnswPath = path.join(swarmDir, 'hnsw.index');
const metadataPath = path.join(swarmDir, 'hnsw.metadata.json');
const dbPath = options?.dbPath || path.join(swarmDir, 'memory.db');
```

The `init` command correctly generates `persistPath: .claude-flow/data` in config.yaml (line 1061 in executor.js), but memory-initializer.js never reads this config.

This causes fragmented storage:
- Config says `.claude-flow/data/`
- Actual files go to `.swarm/`

## Fix

Read `persistPath` from `config.json` or `config.yaml` and use it as the base directory. Fall back to `.swarm/` for backward compatibility.

## Files Patched

- memory/memory-initializer.js

## Ops

1 op in fix.py
