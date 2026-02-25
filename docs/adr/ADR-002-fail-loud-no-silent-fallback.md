# ADR-002: Fail Loud, No Silent Fallback -- Config as Contract

## Status

Accepted

## Date

2026-02-21

## Context

When the configured memory backend (`hybrid`, `sqlite`, `agentdb`) cannot be
loaded at runtime (e.g., `better-sqlite3` native bindings missing), the system
must decide how to handle the failure:

1. **Silent fallback**: catch the error, fall back to the sql.js WASM monolith,
   continue running with degraded functionality.
2. **Fail loud**: error immediately with a clear message and actionable fix command.

Earlier design iterations proposed a `runtime.strict` flag and `--use-fallbacks`
CLI option. Swarm review found this was unimplemented: no code writes
`runtime.strict` to config.yaml, no code reads it, and the `strict` variable
in hook code was unbound.

Silent fallback creates a class of bugs that are invisible to users: config says
`hybrid` (dual SQLite + AgentDB with HNSW), but runtime silently degrades to
WASM-only SQLite. Semantic search stops working. Vector indexing stops. No error.
The user believes they have hybrid memory but they don't.

## Decision

**Config is a contract, not a suggestion.** If config says `backend: hybrid`,
the runtime MUST deliver hybrid or ERROR with a clear message and fix command.
Never silently degrade.

### Backend options are explicit choices

| Config Value | Requires | Behavior |
|-------------|----------|----------|
| `hybrid` (default) | better-sqlite3 + agentdb | Dual SQLite + AgentDB with auto-routing |
| `sqlite` | better-sqlite3 | Native SQLite only |
| `agentdb` | agentdb | AgentDB with HNSW only |
| `sqljs` | (nothing native) | WASM SQLite -- explicitly chosen, not a hidden fallback |
| `memory` | (nothing native) | In-memory only -- data lost on exit, explicitly chosen |

### Error handling rules

1. Feature-level failure, not tool-level: `memory store` errors, but `doctor`/`init` always work
2. Error message includes exact fix command: `Run: npx @claude-flow/cli doctor --install`
3. Error message includes escape hatch: `Or change config to: backend: sqljs`
4. `memory status` always shows configured vs actual backend
5. `doctor` checks intended vs actual backend, warns on mismatch
6. `init` wizard pre-checks available backends, only offers what works

### Example error output

```
ERROR: @claude-flow/memory not loadable -- better-sqlite3 native bindings missing.
  Fix: npx @claude-flow/cli doctor --install
  Or:  Set memory.backend: sqljs in .claude-flow/config.yaml
```

## Consequences

### Positive

- Users always know what backend is actually running
- Config mismatches are detected immediately, not weeks later
- `backend: sqljs` is a real escape hatch for environments without native deps
- No hidden behavioral differences between what config says and what runs
- `doctor --install` provides automated repair path

### Negative

- Default `backend: hybrid` may fail on first run if `better-sqlite3` is broken
- This is a regression from the status quo where sql.js always works (buggily)
- Users must take explicit action to fix or switch backends

### Risks

- First-run experience degrades on platforms where better-sqlite3 doesn't build
- Mitigation: `init` wizard pre-checks deps and suggests `sqljs` if native unavailable
- Mitigation: `doctor --install` attempts `npx node-gyp rebuild` automatically

## Alternatives Considered

### 1. Silent fallback to sql.js

Rejected: creates invisible behavioral differences. User configures hybrid,
gets WASM-only. Semantic search silently stops working. This is worse than
a clear error.

### 2. runtime.strict flag

Rejected: unimplemented in any code path. No writer, no reader. Added complexity
for a mechanism that nobody uses. For v1, always fail loud. A `--use-fallbacks`
flag can be added in a future iteration if demand warrants it.

### 3. Auto-detect and downgrade with warning

Rejected: a warning log line is easily missed. The degradation affects core
functionality (semantic search, HNSW indexing). Users need to make an explicit
choice, not have it made silently for them.

## Implementation

- **Defect**: WM-001 (error handling in WM-001a), CF-003 (doctor --install repair path)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target files**: `memory/memory-initializer.js` (error messages), `commands/doctor.js` (backend check + auto-fix)
