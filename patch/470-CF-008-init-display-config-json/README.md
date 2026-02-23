# CF-008: init.js isInitialized and display strings reference config.yaml

**Severity**: Medium
**GitHub**: [#1199](https://github.com/ruvnet/claude-flow/issues/1199)

## Root Cause

`commands/init.js` has 6 references to `config.yaml`:
1. `isInitialized()` checks `config.yaml` (line 134)
2. Display "Found: .claude-flow/config.yaml" (lines 184, 414)
3. Box output "Config: .claude-flow/config.yaml" (line 270)
4. JSON output path `.claude-flow/config.yaml` (line 721)
5. Display "V3 Runtime: .claude-flow/config.yaml" (line 734)

After SG-008, init generates `config.json`. The init command's own `isInitialized()` won't detect json-only projects, and display strings show the wrong filename.

## Fix

- Replace `isInitialized()` to check both config.json and config.yaml
- Replace all 5 display/output strings from `config.yaml` to `config.json`

## Files Patched

- `commands/init.js`

## Ops

3 ops in fix.py
