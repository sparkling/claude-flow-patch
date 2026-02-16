# IN-001: intelligence.cjs is a stub that doesn't actually learn

**Severity**: Critical
**GitHub**: [#1154](https://github.com/ruvnet/claude-flow/issues/1154)
**Status**: RESOLVED

## Root Cause

`findSourceHelpersDir()` in `dist/src/init/executor.js` (line 855) fails to resolve the package's `.claude/helpers/` directory when running via npx. It tries 4 path strategies, all fail with npx-cached installs. The comment at line 395 says it explicitly: *"Source not found (npx with broken paths) — use generated fallbacks"*.

This causes `executeUpgrade()` to call `generateIntelligenceStub()` (from `helpers-generator.js` line 557) instead of copying the real file. The stub is 197 lines with:
- `feedback()` as a no-op
- `consolidate()` that counts lines and wipes the file
- `getContext()` using simple Jaccard word overlap with no learning
- No PageRank, no graph, no confidence tracking

## The Full Version Exists in the Package

The **916-line full `intelligence.cjs`** ships in the `@claude-flow/cli` package at:
```
node_modules/@claude-flow/cli/.claude/helpers/intelligence.cjs
```

It implements:
- PageRank-ranked memory graph (nodes, edges, power iteration with damping)
- Trigram matching with stop-word filtering
- Confidence feedback loop (boost on success, decay on failure)
- Consolidation: insight generation for hot files, confidence decay for stale entries, graph rebuild
- Snapshot-based trend tracking (up to 50 snapshots)
- Bootstrap from MEMORY.md files when store is empty
- Same 6-method API: `{ init, getContext, recordEdit, feedback, consolidate, stats }`
- Same data directory: `.claude-flow/data/`

## Fix

Copy the full `intelligence.cjs` from the package to replace the stub:

```bash
# Find the package's helpers directory
SRC=$(find ~/.npm/_npx -path '*/@claude-flow/cli/.claude/helpers/intelligence.cjs' 2>/dev/null | head -1)

# Copy to project
cp "$SRC" .claude/helpers/intelligence.cjs
```

This is a drop-in replacement — same export signature, same data files, additive new files (`graph-state.json`, `intelligence-snapshot.json`).

## Verification

```bash
# Should show nodes > 0, edges > 0 (stub always showed edges: 0)
node .claude/helpers/intelligence.cjs stats

# Should show PageRank sum ~1.0
node .claude/helpers/intelligence.cjs stats --json
```

## Files

- `.claude/helpers/intelligence.cjs` — Replace stub with full version from package
- `dist/src/init/executor.js` — Upstream bug: `findSourceHelpersDir()` fails with npx paths
