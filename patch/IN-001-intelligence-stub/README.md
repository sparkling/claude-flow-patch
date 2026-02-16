# IN-001: intelligence.cjs is a stub that doesn't actually learn

**Severity**: Critical
**GitHub**: [#1154](https://github.com/ruvnet/claude-flow/issues/1154)

## Root Cause

`.claude/helpers/intelligence.cjs` (197 lines) is a **minimal stub**. The comment says "Minimal fallback — full version is copied from package source" but the full version was **never copied**.

The stub only does:
- Simple token-based Jaccard similarity (not vector search)
- `consolidate()` just clears the pending file without processing
- `feedback()` is a no-op

Meanwhile, config claims features that aren't active:
```yaml
memory:
  enableHNSW: true      # ← Not used
neural:
  enabled: true         # ← Not used
```

## The Real Implementation

The full implementation exists in ruvector:
- `node_modules/ruvector/dist/core/intelligence-engine.js` (1029 lines)
- Has: HNSW vector search, SONA learning, ONNX embeddings, trajectories, EWC++

## Fix Options

### Option A: Wrapper (Recommended)
Replace the stub with a CJS wrapper that delegates to ruvector:

```javascript
const { Intelligence } = require('ruvector');
let _intel = null;

function getIntel() {
  if (!_intel) {
    _intel = new Intelligence();
    // Note: Can't await in CJS, but ruvector handles lazy init
  }
  return _intel;
}

module.exports = {
  consolidate: () => getIntel().consolidate(),
  feedback: (type, data) => getIntel().feedback(type, data),
  findSimilar: (emb) => getIntel().findSimilar(emb),
  // ... other methods
};
```

### Option B: Use MCP tools directly
The MCP server has working intelligence tools that bypass the stub.

### Option C: Run ruvector init
```bash
npx ruvector hooks init --force --fast
```

## Files to Patch

- `.claude/helpers/intelligence.cjs` — Replace stub with wrapper

## Status

- [x] GitHub issue created (#1154)
- [ ] Fix implemented
- [ ] Patch tested
