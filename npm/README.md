# claude-flow-patch

Patch toolkit for `@claude-flow/cli` runtime and init-script defects.

This package applies verified, idempotent patches to your local CLI source in the npm cache or local `node_modules`, then verifies sentinels and can repair projects initialized before patching.

## What This Solves

`claude-flow init` can generate incomplete or broken project helpers when upstream defects are present. This toolkit addresses known defects in:

- `@claude-flow/cli`
- `ruvector`
- `ruv-swarm`

Current catalog includes 29 tracked defects across 13 categories: headless workers, daemon, config, embeddings, display, memory namespace, ghost vectors, intelligence, settings generator, memory management, hooks, RuVector, and ruv-swarm.

## Quick Start

Patch first, then initialize projects.

```bash
# 1) apply patches (global npx cache + local node_modules)
npx --yes claude-flow-patch patch --scope both

# 2) verify sentinels
npx --yes claude-flow-patch check

# 3) now initialize or upgrade project
npx @claude-flow/cli@latest init
# or
npx @claude-flow/cli@latest init upgrade
```

If you already initialized before patching:

```bash
npx --yes claude-flow-patch repair --target /path/to/project
```

## CLI Commands

| Command | Purpose |
|---|---|
| `claude-flow-patch patch [--scope global\|local\|both]` | Apply all registered patches |
| `claude-flow-patch check` | Verify patch sentinels and auto-detect drift |
| `claude-flow-patch repair --target <dir> [--source auto\|local\|global] [--dry-run]` | Rehydrate `.claude/helpers` in projects initialized before patching |

Aliases: `patch-all`, `check-patches`, `repair-post-init`

## Scope Behavior

| Scope | Patched location |
|---|---|
| `global` | `~/.npm/_npx/*/node_modules/...` |
| `local` | nearest `node_modules/...` in project path |
| `both` | global + local (default) |

Use `both` unless you know exactly which install path your CLI invocation is using.

## Why `repair` Exists

Some fixes patch generator code (`init/executor.js`, `init/settings-generator.js`, `init/helpers-generator.js`). Those fixes affect future generated files only.

If your repo was initialized before patching, existing `.claude/helpers/*` can remain stale. `repair` copies patched helper files into the target repo and creates .js/.cjs compatibility copies where needed.

## How Patching Works

1. Locate CLI/package targets.
2. Concatenate shared helpers (`lib/common.py`) with each defect `fix.py`.
3. Apply string-based replacements with idempotency guards.
4. Validate with sentinel checks.

Design guarantees:

- **Idempotent**: safe to re-run
- **Non-destructive**: modifies local cache/install only
- **Ordered**: dependent patches applied in sequence (e.g. NS-001 -> NS-002 -> NS-003)
- **Platform-aware**: macOS-specific patches auto-skip on Linux

## Compatibility

- Tested with `@claude-flow/cli@3.1.0-alpha.41`
- Tested with `ruv-swarm@1.0.20`
- Requires Bash + Python 3.6+
- Linux and macOS supported

## Links

- Homepage: https://sparklingideas.co.uk/claude-flow/patch
- GitHub: https://github.com/sparkling/claude-flow-patch
- Issues: https://github.com/sparkling/claude-flow-patch/issues
