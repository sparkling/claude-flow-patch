# ADR-008: Wizard Answers Must Propagate to Execution

## Status

Accepted

## Date

2026-02-21

## Context

The `init` wizard (`commands/init.js`) collects user preferences through
interactive prompts, then passes an `options` object to `executeInit()`.
Two categories of bugs break this contract:

### Lost answers -- collected but never forwarded

| User Choice | Wizard Line | What Happens |
|-------------|------------|--------------|
| `permissionRequest` hook | init.js:498 | Offered in `multiselect()` menu, but no `options.hooks.permissionRequest = ...` line exists. Selection is silently discarded. |

The `enableEmbeddings` and `embeddingModel` prompts (lines 571, 577) appear
lost but are actually consumed directly at lines 611-616 via `execSync` calls
that write `embeddings.json`. They never need `options.embeddings.*` because
no downstream code reads those properties. (Confirmed by Review 4, R4-1.)

### Hardcoded overrides -- user selection ignored

| User Choice | Wizard Line | Override Location | What Happens |
|-------------|------------|-------------------|--------------|
| Topology (e.g. `star`, `mesh`, `ring`) | init.js:519 → `options.runtime.topology` | init.js:678 | `--start-all` path hardcodes `--topology hierarchical`, ignoring the user's selection |

The user explicitly selects a topology in the wizard, sees it confirmed, then
`--start-all` silently uses `hierarchical` regardless.

## Decision

**Every wizard answer that is collected MUST reach the code that acts on it.**
This is a contract: if the UI asks the user a question, the answer must affect
behavior. Otherwise the question should not be asked.

### Fix 1: permissionRequest hook capture (SG-006b)

After the hooks `multiselect()` at ~line 500, add:
```javascript
options.hooks.permissionRequest = hooks.includes('permissionRequest');
```

This follows the existing pattern for other hook selections in the same block
(`options.hooks.preEdit`, `options.hooks.postEdit`, etc.).

### Fix 2: Topology propagation in --start-all (SG-006c)

At line 678, replace:
```javascript
`--topology hierarchical`
```
with:
```javascript
`--topology ${options.runtime.topology || 'hierarchical-mesh'}`
```

The default is `hierarchical-mesh` (matching CLAUDE.md project config), not
`hierarchical`, because the wizard's default selection is `hierarchical-mesh`.

### What was NOT fixed (and why)

**SG-006a (embeddings capture) -- dropped.** Review 4 confirmed that
`options.embeddings.enabled` and `options.embeddings.model` are never read by
`executeInit()`. The wizard's local variables `enableEmbeddings` and
`embeddingModel` ARE used directly at lines 611-616 via `execSync` calls that
write `embeddings.json`. Assigning to `options.embeddings.*` would be dead code.

## Consequences

### Positive

- Users who select `permissionRequest` in the hooks menu will actually get it
  configured in their project
- Users who select `star`, `mesh`, `ring`, or any non-default topology will
  have `--start-all` use their selection
- Wizard behavior matches wizard UI -- no silent overrides
- Minimal change: 2 patch ops, no new code paths

### Negative

- None identified. Both fixes add single lines that follow existing patterns.

### Risks

- `options.runtime.topology` could be undefined if the user skips the wizard
  topology step. The `|| 'hierarchical-mesh'` fallback handles this.
- `hooks.includes('permissionRequest')` assumes `hooks` is the array from
  `multiselect()`. This is the same pattern used for all other hook options
  in the block.

## Alternatives Considered

### 1. Remove the permissionRequest option from the wizard

Rejected: the option is intended to exist (it appears in the multiselect menu
alongside other valid hooks). The fix is to wire it, not remove it.

### 2. Always use hierarchical topology

Rejected: the wizard explicitly offers topology choices. If the intent were
always-hierarchical, the question should not be asked. Since it is asked,
the answer must be respected.

### 3. Fix embeddings capture too (SG-006a)

Rejected: `executeInit()` never reads `options.embeddings.*`. The wizard
already handles embeddings correctly via local variables and `execSync`.
Adding dead assignments to `options.embeddings.*` would be misleading --
it would look like the code uses them when it doesn't.

## Implementation

- **Defect**: SG-006 (patch ops SG-006b + SG-006c)
- **Plan**: [memory-wiring-plan.md](../memory-wiring-plan.md), Task 1
- **Target file**: `commands/init.js` (path var `INIT_CMD`)
