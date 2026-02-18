# HK-001: post-edit hook records file_path as "unknown"

**Severity**: Medium
**GitHub**: [#1155](https://github.com/ruvnet/claude-flow/issues/1155)

## Root Cause

The `hook-handler.cjs` template (in `helpers-generator.js`) reads the edited file
path from `process.env.TOOL_INPUT_file_path`. However, Claude Code's PostToolUse
hooks do **not** set individual `TOOL_INPUT_*` environment variables. Instead, tool
input is delivered via **stdin** as a JSON object:

```json
{
  "tool_name": "Edit",
  "tool_input": { "file_path": "/path/to/file", ... },
  "tool_response": { ... },
  ...
}
```

Because the env var is always empty, `recordEdit()` in `intelligence.cjs` logs
every edit as `file: "unknown"`. The data is consumed by `consolidate()` at session
end for edit-count analytics — cosmetic but wrong.

## Fix

Two changes in `init/helpers-generator.js`:

1. **Add stdin parsing** after the `argv` line — read and parse the JSON that
   Claude Code pipes to PostToolUse hook commands.
2. **Update post-edit handler** — read `stdinData.tool_input.file_path` instead
   of `process.env.TOOL_INPUT_file_path`.

The `prompt` fallback for the `route` handler is also updated to prefer
`stdinData.tool_input.command` over the env var.

## Files Patched

- init/helpers-generator.js

## Ops

2 ops in fix.py
