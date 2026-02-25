# ADR-009: Config-Driven Feature Gating at Runtime

## Status

Accepted

## Date

2026-02-21

## Context

The init wizard writes feature flags to `.claude-flow/config.yaml`:

```yaml
neural:
  enabled: true    # or false -- user's choice
memory:
  backend: hybrid
  learningBridge:
    enabled: true
  memoryGraph:
    enabled: true
```

These values are **written but never read** at runtime. Specifically:

- `neural.enabled` is written by `executor.js` but `initializeIntelligence()`
  in `memory/intelligence.js` always runs unconditionally
- `memory.learningBridge.enabled` and `memory.memoryGraph.enabled` are written
  but never consumed

The user disables neural patterns in the wizard, expects them off, but they
run anyway. This violates the principle that config controls behavior.

### Re-initialization loop hazard

`memory/intelligence.js` has a module-level flag `intelligenceInitialized`
(line ~25). Multiple callers check this flag:
- If `intelligenceInitialized === false`, they call `initializeIntelligence()`
- If the function returns early WITHOUT setting the flag to `true`, callers
  re-invoke it in a loop

## Decision

**Config values written by the wizard MUST control runtime behavior.** If
config says `neural.enabled: false`, the neural intelligence system must not
initialize.

### Implementation (WM-002c)

At the top of `initializeIntelligence()` in `memory/intelligence.js`:

```javascript
// WM-002c: Read neural.enabled from config.json — skip init when disabled
let neuralEnabled = true;
try {
  const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    if (cfg.neural && cfg.neural.enabled === false) neuralEnabled = false;
  }
} catch {}

// Gate: skip initialization if disabled
if (!neuralEnabled) {
  intelligenceInitialized = true;  // MUST set -- callers check this flag
  return;
}
```

**Note**: The original decision (2026-02-21) specified YAML regex parsing of
`.claude-flow/config.yaml`. This was superseded by the config.json migration
(SG-008, CF-004 through CF-008). WM-006 (the YAML reader for `neural.enabled`)
was absorbed into WM-002, which now reads `config.json` via `JSON.parse()`.

### Critical: Set the initialized flag even when gating

When neural is disabled, the gating code MUST set `intelligenceInitialized = true`
before returning. If it stays `false`:
1. Caller A checks flag -> false -> calls `initializeIntelligence()`
2. Function returns early without setting flag
3. Caller B checks flag -> still false -> calls `initializeIntelligence()` again
4. Infinite loop until stack overflow or performance collapse

The flag means "initialization has been handled" (either by running or by
deciding not to run), not "neural is active".

## Consequences

### Positive

- Users who disable neural in the wizard actually get it disabled
- Config values become meaningful -- not just cosmetic
- Same config.json reading pattern as ADR-005 (memory.backend) -- consistent approach
- `intelligenceInitialized = true` in the gating path prevents re-initialization loops
- Feature gating pattern is extensible to `learningBridge` and `memoryGraph`

### Negative

- Adds config file reading to a hot initialization path (one-time cost, ~1ms)
- `process.cwd()` assumption (same pre-existing assumption as ADR-005)

### Risks

- Config file not found -> defaults to enabled (safe default, matches
  previous behavior)
- `enabled: false` in JSON is unambiguous (boolean). No YAML `no`/`false`
  string coercion issues since config.json migration.
- Future config values (e.g. `learningBridge.enabled`) will need similar
  gating -- accepted as incremental work

## Alternatives Considered

### 1. Always run neural, ignore config

Rejected: the wizard explicitly asks the user whether to enable neural.
Writing the answer but ignoring it violates user trust. If we don't intend
to respect the answer, we should not ask the question.

### 2. Use a centralized config service

Rejected: no such service exists in the codebase. Building one for a single
boolean read is over-engineering. The config.json reading pattern from ADR-005
is sufficient and consistent.

### 3. Set intelligenceInitialized = false when gating

Rejected: callers check this flag and re-invoke `initializeIntelligence()` if
it's `false`. Leaving it false creates an infinite re-initialization loop.
The flag means "handled", not "active".

### 4. Environment variable override

Considered but deferred: `CLAUDE_FLOW_NEURAL_ENABLED` could override config.json.
Not needed for v1 since neural config is project-specific, not
deployment-specific. Can be added later if needed.

### 5. YAML regex parsing (original approach)

The original implementation (2026-02-21) used hand-rolled YAML regex to read
`.claude-flow/config.yaml`. Superseded by the config.json migration (SG-008).
WM-006 was absorbed into WM-002.

## Implementation

- **Defect**: WM-002 (patch op WM-002c)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target file**: `memory/intelligence.js` (path var `INTEL` -- new, add to `lib/common.py`)
- **Critical detail**: Must set `intelligenceInitialized = true` in gating path -- see plan R4-6
