# ADR-010: Trust Boundary Alignment -- Align, Do Not Merge

## Status

Accepted

## Date

2026-02-25

## Context

The CLI memory system (WM-001 through WM-012) and the guidance governance
system operate as two independent subsystems with separate storage, separate
write paths, and no mandatory integration points:

| Subsystem | Storage | Writers |
|-----------|---------|---------|
| CLI Memory | HybridBackend (SQLite + AgentDB v3 RVF) in `.swarm/` | MCP tools (`memory_store`), AutoMemoryBridge (`doSync`) |
| Governance | TrustAccumulator, ProofChain, EvolutionPipeline in `.claude-flow/guidance/` | GuidanceAdvancedRuntime |

Two bridges exist between these subsystems:

- **EmbeddingProvider bridge**: Allows governance to generate embeddings via
  the CLI memory system's embedding pipeline. Optional -- falls back to
  deterministic hash vectors when unavailable.
- **MemoryWriteGateHook bridge**: Pre-write validation hook that checks
  entries against governance rules before storage. Optional -- not in the
  mandatory write path.

Both bridges are opt-in. MemoryWriteGateHook is particularly critical: because it is not
mandatory, contradictory entries can be stored in CLI memory without governance
review. Trust scores computed by TrustAccumulator have no effect on search
result ranking. A suspended agent's memory entries surface with the same
priority as a trusted agent's entries.

The question: should these two subsystems be merged into a single store, or
kept separate with mandatory bridges enforcing the trust boundary?

## Decision

**Align, do not merge.** Maintain separate storage with mandatory bridges
enforcing the trust boundary between CLI memory and governance state.

### Five alignment points

| ID | Alignment | Description |
|----|-----------|-------------|
| R1 | Mandatory write gate | Make MemoryWriteGateHook mandatory in all write paths (`memory_store` MCP handler, `AutoMemoryBridge.doSync`) |
| R2 | Trust-aware search reranking | Wire trust scores into search result reranking (`similarity * trustMultiplier`) |
| R3 | Production embedding provider | Default to `AgentDBEmbeddingProvider` in production (not hash fallback) |
| R4 | Separate governance RVF | Create separate `.swarm/governance.rvf` for governance state |
| R5 | Cross-system integration tests | Add integration tests covering the bridge paths end-to-end |

### Trust boundary rule

Agents can read and write their own memory (`.swarm/agentdb-memory.rvf`) but
can only READ governance state (`.swarm/governance.rvf`, `.claude-flow/guidance/`).
Only governance code writes to governance storage. This is enforced by file-level
separation: the CLI memory write path has no reference to governance storage
paths, and governance storage paths are opened read-only from CLI context.

### Storage layout after alignment

```
.swarm/
  hybrid-memory.db       # SQLiteBackend (existing, per ADR-003)
  agentdb-memory.rvf     # AgentDB v3 RVF -- agent memory (existing, per ADR-003)
  governance.rvf          # AgentDB v3 RVF -- governance state (NEW, R4)
.claude-flow/
  guidance/               # Governance rules, trust state, proof chain (existing)
```

## Consequences

### Positive

- Trust boundary prevents agents from tampering with their own governance
  rules -- separate RVF files mean a bug in memory write code cannot corrupt
  governance state
- MemoryWriteGateHook as mandatory gate prevents memory poisoning from contradictory
  writes -- every entry is validated against governance rules before storage
- Trust-aware search filtering removes entries from suspended agents --
  `trustMultiplier` of 0.0 for suspended tier pushes results below threshold
- Witness chain on separate governance RVF detects inter-session tampering --
  SHAKE-256 chain covers governance state independently of memory state
- Config schemas already aligned (19/19 keys match between repos per WM-007)

### Negative

- Two database files instead of one (separate RVF files for memory and
  governance) -- additional disk usage and two witness chains to verify
- Governance state must be readable from CLI MCP context (cross-process
  file read) -- adds a `fs.readFileSync` call for trust state JSON
- Trust reranking adds latency to search (JSON file read + Map lookup per
  result) -- estimated 1-3ms overhead for typical result sets

### Risks

- Trust state file may not exist if governance is not initialized -- fallback:
  treat all agents as standard tier with `trustMultiplier` of 1.0, log a
  warning but do not block the search
- `author_id` may not be present in search results -- fallback: skip trust
  reranking for entries without author attribution, apply multiplier 1.0
- Separate governance RVF means witness chain verification must cover two
  files at session start -- WM-010 verification logic needs to iterate
  both `.swarm/agentdb-memory.rvf` and `.swarm/governance.rvf`

## Alternatives Considered

### 1. Full merge into single AgentDB RVF

Rejected: trust boundary violation. An agent with write access to memory could
tamper with governance rules stored in the same database. Namespace isolation
within a single RVF file is insufficient -- a bug in namespace enforcement
collapses the boundary entirely. Separate files provide separate attack
surfaces. A compromised memory write path cannot reach governance data in a
different file.

### 2. Keep systems fully isolated (no mandatory bridges)

Rejected: this is the current state. MemoryWriteGateHook is optional so contradictory
entries can be stored without validation. Trust scores computed by
TrustAccumulator have no effect on search results. Suspended agents' entries
surface with normal priority. This provides zero protection against memory
poisoning and makes the governance system purely advisory with no enforcement
power.

### 3. Merge learning loops only (keep storage separate)

Rejected: the learning loops serve different purposes and should not be
conflated. PageRank (in intelligence.cjs) ranks entries by structural
importance in the memory graph. AgentDB contrastive learning adapts embedding
similarity weights based on user feedback. They complement rather than
duplicate each other. Merging them would create a single loop that tries to
optimize for two unrelated objectives.

### 4. Use process-level isolation instead of file-level

Rejected: governance runs in the same Node.js process as the CLI. Process-level
isolation would require a separate daemon for governance state management,
adding operational complexity (daemon lifecycle, IPC, health monitoring) for
minimal security benefit. File-level separation (different RVF files, different
directories) is simpler and sufficient for the threat model where the adversary
is a misbehaving agent within the same process, not a compromised OS process.

## Implementation

New defects to create:

- **WM-013**: Wire trust scores into search result ranking (3-4 ops in
  `memory-initializer.js` path var `MI` and `memory-tools.js` path var
  `MCP_MEMORY`)
- **WM-014**: Wire MemoryWriteGateHook as mandatory write gate in `memory_store` handler
  (1-2 ops in `MCP_MEMORY`)
- **GV-002** (new category: Governance): Create separate `.swarm/governance.rvf`
  backend instance

Related defects (completed -- prerequisites):

- WM-001 through WM-012 (CLI memory system wiring)
- EmbeddingProvider, MemoryWriteGateHook (implemented in guidance repo -- bridges this ADR mandates)

Target files:

- `mcp-tools/memory-tools.js` (path var `MCP_MEMORY`) -- R1 write gate,
  R2 search reranking
- `memory/memory-initializer.js` (path var `MI`) -- R2 trust state loader
  helpers
- `auto-memory-hook.mjs` (generated by SG-003) -- R1 write gate for
  `doSync` path

Plan reference: [guidance-memory-alignment.md](../guidance-memory-alignment.md)
