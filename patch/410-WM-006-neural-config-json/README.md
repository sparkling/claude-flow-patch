# WM-006: intelligence.js reads neural.enabled from config.yaml regex instead of config.json

**Severity**: Medium
**GitHub**: [#1192](https://github.com/ruvnet/claude-flow/issues/1192)

## Root Cause

`initializeIntelligence()` in `intelligence.js` reads `neural.enabled` from config.yaml using a hand-rolled regex:

```javascript
const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
const content = readFileSync(yamlPath, 'utf-8');
const neuralSection = content.match(/^neural:\s*\n((?:[ \t]*.*\n?)*?)(?=^\S|$)/m);
```

This regex-based parser is fragile and inconsistent with config.json as the canonical source.

## Fix

Replace the YAML regex parser with a JSON reader that reads `neural.enabled` from `.claude-flow/config.json`, falling back to `true` when no config exists.

## Files Patched

- `memory/intelligence.js`

## Ops

1 op in fix.py
