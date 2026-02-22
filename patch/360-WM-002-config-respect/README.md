# WM-002: Neural config gating (neural.enabled not consumed at runtime)

**Severity**: Medium
**GitHub**: [#1185](https://github.com/ruvnet/claude-flow/issues/1185)

## Root Cause

The init wizard writes `neural.enabled: true/false` to `config.yaml`, but
`initializeIntelligence()` in `memory/intelligence.js` always runs regardless
of this config setting. The config value is never read at runtime.

## Fix

Insert a config gate at the top of `initializeIntelligence()` that reads
`neural.enabled` from `.claude-flow/config.json` (absorbs WM-006). When `false`,
the function sets `intelligenceInitialized = true` (to prevent re-invocation
loops from callers that check this flag) and returns early without initializing
SONA or ReasoningBank. WM-002d (regex anchor fix) was removed since WM-002c no
longer writes YAML regex code.

## Files Patched

- `memory/intelligence.js`

## Ops

1 op in fix.py (WM-002c; WM-002d removed)
