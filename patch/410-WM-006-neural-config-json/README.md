# WM-006: intelligence.js reads neural.enabled from config.yaml regex instead of config.json

**Severity**: Medium
**GitHub**: [#1192](https://github.com/ruvnet/claude-flow/issues/1192)
**Status**: Absorbed into WM-002

## Root Cause

`initializeIntelligence()` in `intelligence.js` reads `neural.enabled` from config.yaml using a hand-rolled regex:

```javascript
const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
const content = readFileSync(yamlPath, 'utf-8');
const neuralSection = content.match(/^neural:\s*\n((?:[ \t]*.*\n?)*?)(?=^\S|$)/m);
```

This regex-based parser is fragile and inconsistent with config.json as the canonical source.

## Fix

Absorbed into WM-002: WM-002c now writes the config.json reader directly instead of the YAML regex.

## Files Patched

- `memory/intelligence.js` (via WM-002)

## Ops

0 ops in fix.py (absorbed)
