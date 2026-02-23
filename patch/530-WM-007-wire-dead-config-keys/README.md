# WM-007: Wire dead config.json keys into runtime consumers

**Severity**: High
**GitHub**: [#1204](https://github.com/ruvnet/claude-flow/issues/1204)

## Root Cause

`init` writes 19 keys to `.claude-flow/config.json` via `writeRuntimeConfig()` in
executor.js, but only 7 are consumed at runtime (`memory.backend`, `neural.enabled`,
`swarm.topology`, `swarm.maxAgents`, `swarm.autoScale`, `mcp.autoStart`, `mcp.port`).
The remaining 12 are dead — written but never read:

- `memory.cacheSize` — hardcoded 256 in embeddings-tools.js
- `memory.enableHNSW` — read from embeddings.json instead of config.json
- `memory.learningBridge.*` (sonaMode, confidenceDecayRate, accessBoostAmount, consolidationThreshold)
- `memory.memoryGraph.*` (pageRankDamping, maxNodes, similarityThreshold)
- `memory.agentScopes.defaultScope` — hardcoded `'default'`
- `neural.modelPath` — hardcoded `.claude-flow/neural`
- `hooks.enabled` — never checked
- `swarm.coordinationStrategy` — never passed to swarm_init

## Fix

12 ops wire 17 dead/undergated keys into their respective consumers.

| Op | File | Keys wired |
|----|------|-----------|
| a | memory-initializer.js | cacheSize, enableHNSW, similarityThreshold, defaultScope |
| b | intelligence.js | learningBridge.sonaMode/confidenceDecayRate/accessBoostAmount/consolidationThreshold, memoryGraph.pageRankDamping/maxNodes |
| c | intelligence.js | neural.modelPath |
| d | start.js | swarm.coordinationStrategy |
| e | hooks-tools.js | hooks.enabled |
| f | embeddings-tools.js | memory.cacheSize |
| g | hooks-tools.js | hooks.autoExecute |
| h | memory-initializer.js | memory.agentScopes.enabled |
| i | intelligence.js | memory.learningBridge.enabled, memory.memoryGraph.enabled |
| j | memory-initializer.js | memory.memoryGraph.enabled (semanticThreshold gate) |

## Files Patched

- `memory/memory-initializer.js`
- `memory/intelligence.js`
- `commands/start.js`
- `mcp-tools/hooks-tools.js`
- `mcp-tools/embeddings-tools.js`

## Ops

12 ops in fix.py
