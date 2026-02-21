# Architecture Decision Records

ADRs for the memory wiring plan (Tasks 1-6). Each records a key architectural
decision made during 4 rounds of Opus swarm review (12 agents, 48+ findings).

## Index

| ADR | Title | Status | Task |
|-----|-------|--------|------|
| [ADR-001](ADR-001-use-hybridbackend-directly.md) | Use HybridBackend Directly as Memory Backend | Accepted | WM-001 |
| [ADR-002](ADR-002-fail-loud-no-silent-fallback.md) | Fail Loud, No Silent Fallback -- Config as Contract | Accepted | WM-001 |
| [ADR-003](ADR-003-separate-database-files.md) | Separate Database Files for Schema Coexistence | Accepted | WM-001 |
| [ADR-004](ADR-004-embedding-generator-wrapping.md) | Embedding Generator Wrapping Pattern (Float32Array) | Accepted | WM-001 |
| [ADR-005](ADR-005-config-priority-chain.md) | Config Priority Chain for Memory Backend Selection | Accepted | WM-001 |
| [ADR-006](ADR-006-concurrent-access-busy-timeout.md) | Concurrent Access -- SQLiteBackend-Only busy_timeout | Accepted | WM-001, WM-003 |
| [ADR-007](ADR-007-auto-memory-hook-without-embeddings.md) | AutoMemoryBridge Hook Without Embedding Generator | Accepted | WM-003 |
| [ADR-008](ADR-008-wizard-answers-must-propagate.md) | Wizard Answers Must Propagate to Execution | Accepted | SG-006 |
| [ADR-009](ADR-009-config-driven-feature-gating.md) | Config-Driven Feature Gating at Runtime | Accepted | WM-002 |

## Format

Each ADR follows the [Michael Nygard template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Context**: What problem are we facing?
- **Decision**: What did we decide and why?
- **Consequences**: Positive, negative, and risks
- **Alternatives Considered**: What else was evaluated and why rejected?

## Relationship to Plan

These ADRs document the "why" behind decisions in the
[memory wiring plan](../memory-wiring-plan.md). The plan documents the "what"
and "how". Together they provide complete traceability from requirement through
design to implementation.

## Swarm Review Provenance

Decisions were validated through 4 rounds of 3-agent Opus review:

| Review | Focus | Findings |
|--------|-------|----------|
| R1 | Code assumption validation | 22/23 confirmed, 2 CRITICAL found |
| R2 | Fix validation | 1 CRITICAL (Float32Array), 3 HIGH |
| R3 | Fresh analysis | 4 CRITICAL (signatures, types, names), 3 HIGH |
| R4 | Cross-check with code | 3 CRITICAL (const, PRAGMA, escaping), 6 HIGH |

All CRITICAL and HIGH findings have been resolved in the plan and reflected
in these ADRs.
