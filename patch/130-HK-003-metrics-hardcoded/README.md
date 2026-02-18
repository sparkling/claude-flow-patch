# HK-003: hooks_metrics MCP handler returns hardcoded fake data

**Severity**: High
**GitHub**: [#1158](https://github.com/ruvnet/claude-flow/issues/1158)

## Root Cause

The `hooksMetrics` handler in `mcp-tools/hooks-tools.js` returns a static
object literal with fake values (15 patterns, 87% routing accuracy, 128
commands executed). It never reads from any persistence layer.

This is the same class of defect as HK-002 (hook handlers returning fake
data without persisting), but for the metrics/dashboard endpoint.

## Fix

Replace the hardcoded return with a function that:
1. Reads `.swarm/sona-patterns.json` for pattern counts, confidence, and routing stats
2. Reads `.ruvector/intelligence.json` for trajectory/command counts and success rates
3. Computes actual metrics from the persisted data
4. Falls back to zeros when files don't exist
5. Preserves the static performance targets (those are design goals, not metrics)

## Files Patched

- `mcp-tools/hooks-tools.js`

## Ops

1 op in fix.py
