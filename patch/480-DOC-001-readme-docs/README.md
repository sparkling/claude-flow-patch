# DOC-001: Update upstream README.md to match patched CLI behavior

**Severity**: Enhancement
**GitHub**: [#1201](https://github.com/ruvnet/claude-flow/issues/1201)

## Root Cause

After 47 patches, the upstream `README.md` still describes pre-patch behavior:
config paths, schema keys, doctor checks, and use-case examples that no longer
match the running code. Incorrect documentation misleads users about:

- Config location (old: `./claude-flow.config.json`, actual: `./.claude-flow/config.json`)
- Memory schema key (old: `"type"`, actual: `"backend"`)
- Doctor capabilities (`--install` flag, memory backend check)
- Doctor checks (YAML support no longer present)

## Fix

14 targeted string replacements in `README.md` to align documentation with
patched behavior. No patch IDs appear in the output — the README reads as
natural documentation.

| Op | Section | Change |
|----|---------|--------|
| a | Doctor table | `Valid JSON/YAML` → `Valid JSON` |
| b | Doctor commands | Insert `--install` option |
| c | Doctor output | Config path + add Mem Backend line |
| d | Env var table | Config path |
| e | Config location | `.claude-flow/config.json` as primary, legacy as #2 |
| f | Memory schema | `type`→`backend`, add `syncMode`, `learningBridge`, `memoryGraph`, `agentScopes` |
| g | Pre-use-case | Note: `neural.enabled: false` disables SONA/ReasoningBank |
| h | Breaking changes | Config path |
| i | V3 config example | Config path + `type`→`backend` |
| j | Migration issues | Config path + "run init" |
| k | Dev config | `type`→`backend` |
| l | Prod config | `type`→`backend` |
| m | CI config | `type`→`backend` |
| n | Mem-constrained | `type`→`backend` |

## Files Patched

- `README.md` (package root)

## Ops

14 ops in fix.py
