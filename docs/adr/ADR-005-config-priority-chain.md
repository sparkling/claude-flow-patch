# ADR-005: Config Priority Chain for Memory Backend Selection

## Status

Accepted

## Date

2026-02-21

## Context

The memory backend choice (`hybrid`, `sqlite`, `agentdb`, `sqljs`, `memory`)
needs to be read from configuration at runtime. Currently, no code reads this
config -- `config-adapter.js::normalizeMemoryBackend()` is a pure string
validator that reads no files and no env vars.

Multiple config sources exist:
- `CLAUDE_FLOW_MEMORY_BACKEND` env var (written to `.mcp.json` env block by
  `init` via `mcp-generator.js:45`)
- `.claude-flow/config.yaml` `memory.backend` field (written by init wizard)
- `options.backend` parameter passed to `initializeMemoryDatabase()` (defaults
  to `'hybrid'`)

Additionally, `initializeMemoryDatabase()` destructures `backend` as:
```javascript
const { backend = 'hybrid', ... } = options;
```
This creates a `const` binding that cannot be reassigned.

## Decision

### Priority chain (highest to lowest)

1. **`.claude-flow/config.json` `memory.backend`** -- project-level config file.
   Read via `JSON.parse()`.
2. **Default: `'hybrid'`** -- per upstream ADR-009 design intent.

### Implementation

Use a **new variable** `backendChoice` to avoid reassigning the `const` binding:

```javascript
let backendChoice = backend;  // start with options value

// Read from config.json (absorbs WM-005)
try {
  const cfgPath = path.join(process.cwd(), '.claude-flow', 'config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (cfg.memory && cfg.memory.backend) backendChoice = cfg.memory.backend;
  }
} catch {}

// Normalize
backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
  ? backendChoice : 'hybrid';
```

### Config format

The original decision (2026-02-21) specified YAML regex parsing of
`.claude-flow/config.yaml`. This was superseded by the config.json migration
(SG-008, CF-004 through CF-008) which converted all config reading to JSON.
WM-005 (the YAML reader for `memory.backend`) was absorbed into WM-001, which
now reads `config.json` directly via `JSON.parse()`. The env var override
(`CLAUDE_FLOW_MEMORY_BACKEND`) was dropped during the migration -- config.json
is the single source of truth.

## Consequences

### Positive

- Config.json is respected for backend selection
- `JSON.parse()` is robust (no regex fragility)
- `const` binding preserved -- no `TypeError` at runtime
- All subsequent code uses `backendChoice` consistently

### Negative

- Only reads `memory.backend` -- not a general config reader (other keys
  wired separately by WM-007)
- `process.cwd()` assumption: config.json must be in working directory

### Risks

- `process.cwd()` may not be the project root if the MCP server starts from
  a different directory -- pre-existing assumption in `memory-initializer.js`
- Unrecognized backend values normalize to `'hybrid'` -- could mask typos

## Alternatives Considered

### 1. Reassign the const backend variable

Rejected: `const { backend = 'hybrid', ... } = options` at line 898 creates
a `const` binding. `backend = process.env...` throws `TypeError: Assignment
to constant variable` at runtime.

### 2. General-purpose config reader

Rejected: over-engineering for this scope. We need one value (`memory.backend`)
from one file. A general reader would need to handle all config sections,
nested values, type coercion -- all for a patch that should be minimal.

### 3. YAML regex parsing (original approach)

The original implementation (2026-02-21) used hand-rolled YAML regex to read
`.claude-flow/config.yaml`. This was replaced during the config.json migration
(SG-008) because JSON parsing is more robust and the entire codebase moved
from config.yaml to config.json.

## Implementation

- **Defect**: WM-001 (patch op WM-001a -- config reading at top of `initializeMemoryDatabase()`)
- **Plan**: (originally in memory-wiring-plan.md, superseded by [memory-system.md](../memory-system.md))
- **Target file**: `memory/memory-initializer.js` (path var `MI`)
- **Critical detail**: Must use `let backendChoice = backend` (new variable) -- see plan R4-2
