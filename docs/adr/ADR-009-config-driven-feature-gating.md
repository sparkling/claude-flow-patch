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
// Read neural.enabled from config.yaml
let neuralEnabled = true;  // default: enabled
try {
  const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    const content = fs.readFileSync(yamlPath, 'utf-8');
    const neuralSection = content.match(/^neural:\s*\n((?:[ \t]*.*\n)*?(?=^\S|\Z))/m);
    if (neuralSection) {
      const enabledMatch = neuralSection[1].match(/^\s+enabled:\s*(\S+)/m);
      if (enabledMatch) neuralEnabled = enabledMatch[1] !== 'false';
    }
  }
} catch {}

// Gate: skip initialization if disabled
if (!neuralEnabled) {
  intelligenceInitialized = true;  // MUST set -- callers check this flag
  return;
}
```

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
- Same YAML parsing pattern as ADR-005 (memory.backend) -- consistent approach
- `intelligenceInitialized = true` in the gating path prevents re-initialization loops
- Feature gating pattern is extensible to `learningBridge` and `memoryGraph`

### Negative

- Adds config file reading to a hot initialization path (one-time cost, ~1ms)
- YAML regex parsing is fragile (same limitation as ADR-005)
- `process.cwd()` assumption (same pre-existing assumption as ADR-005)

### Risks

- Config file not found -> defaults to enabled (safe default, matches
  previous behavior)
- `enabled: false` vs `enabled: "false"` vs `enabled: no` -- regex matches
  the literal string `false` only. YAML `no` is not handled. Acceptable
  because the wizard writes `false` (not `no`).
- Future config values (e.g. `learningBridge.enabled`) will need similar
  gating -- accepted as incremental work

## Alternatives Considered

### 1. Always run neural, ignore config

Rejected: the wizard explicitly asks the user whether to enable neural.
Writing the answer but ignoring it violates user trust. If we don't intend
to respect the answer, we should not ask the question.

### 2. Use a centralized config service

Rejected: no such service exists in the codebase. Building one for a single
boolean read is over-engineering. The YAML regex pattern from ADR-005 is
sufficient and consistent.

### 3. Set intelligenceInitialized = false when gating

Rejected: callers check this flag and re-invoke `initializeIntelligence()` if
it's `false`. Leaving it false creates an infinite re-initialization loop.
The flag means "handled", not "active".

### 4. Environment variable override

Considered but deferred: `CLAUDE_FLOW_NEURAL_ENABLED` could override config.yaml
(same pattern as ADR-005 for memory backend). Not needed for v1 since neural
config is project-specific, not deployment-specific. Can be added later if
needed.

## Implementation

- **Defect**: WM-002 (patch op WM-002c)
- **Plan**: [memory-wiring-plan.md](../memory-wiring-plan.md), Task 3
- **Target file**: `memory/intelligence.js` (path var `INTEL` -- new, add to `lib/common.py`)
- **Critical detail**: Must set `intelligenceInitialized = true` in gating path -- see plan R4-6
