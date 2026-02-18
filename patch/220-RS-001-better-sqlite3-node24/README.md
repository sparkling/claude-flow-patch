# RS-001: ruv-swarm MCP fails on Node 24 — better-sqlite3 missing native bindings

**Severity**: Critical
**Package**: `ruv-swarm@1.0.20`
**GitHub**: [ruv-FANN#185](https://github.com/ruvnet/ruv-FANN/issues/185)

## Symptoms

`ruv-swarm mcp start` crashes immediately with:

```
Could not locate the bindings file. Tried:
 → .../better-sqlite3/lib/binding/node-v137-linux-x64/better_sqlite3.node
```

The MCP server never starts. All ruv-swarm MCP tools are unavailable.

## Root Cause

`ruv-swarm@1.0.20` declares `"better-sqlite3": "^11.6.0"` in `package.json`.
When installed via `npx`, npm resolves this to `better-sqlite3@11.10.0`.

`better-sqlite3` 11.x does **not** ship prebuilt binaries for Node 24
(ABI version `node-v137`). The native addon compilation fails silently
during `npx` install — `build/Release/` contains intermediate `obj/`
directories but no `better_sqlite3.node` binary.

`better-sqlite3` 12.x (`^12.0.0`) added Node 24 to its supported engines
and ships prebuilt binaries for `node-v137-linux-x64`.

## Why @claude-flow/cli is unaffected

`@claude-flow/cli` uses `sql.js` (pure WASM SQLite) instead of `better-sqlite3`.
WASM has no native bindings and works on any Node version.

## Fix

Bump the dependency from `^11.6.0` to `^12.0.0` in `ruv-swarm/package.json`.

## Files Patched

- `ruv-swarm` `package.json` (in npx cache)

## Ops

1 op in fix.py (JSON string replacement in package.json)
1 op: `npm rebuild better-sqlite3` in the npx cache directory

## Verification

```bash
npx -y ruv-swarm --version
# Should print version without crashing
```
