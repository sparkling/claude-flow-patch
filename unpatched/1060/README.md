# 1060: init defaults and generated hook timeouts are too low for npx/cold-start paths

**Severity**: Medium
**GitHub**: [#1060](https://github.com/ruvnet/claude-flow/issues/1060)

## Root Cause

Several generated/default hook timeouts remain at `5000ms`, which is too short for npx startup and cold-start environments, causing intermittent hook timeouts.

## Fix

Raise baseline timeout values in init defaults and generated hook blocks from `5000` to `10000` for affected paths.

## Files Patched

- init/types.js
- init/settings-generator.js
- init/executor.js

## Verification

- Regenerate settings via init and inspect timeout values in hook entries.
- Confirm affected hooks now default to `10000ms`.

## Ops

6 ops in fix.py
