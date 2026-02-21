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

1. **`CLAUDE_FLOW_MEMORY_BACKEND` env var** -- set in `.mcp.json` env block,
   available to MCP server process. Takes absolute priority because the project
   owner explicitly configured it.
2. **`.claude-flow/config.yaml` `memory.backend`** -- project-level config file.
   Read via regex match scoped to the `memory:` section.
3. **Default: `'hybrid'`** -- per upstream ADR-009 design intent.

### Implementation

Use a **new variable** `backendChoice` to avoid reassigning the `const` binding:

```javascript
let backendChoice = backend;  // start with options value

// 1. Env var takes priority
if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
  backendChoice = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
}

// 2. Fall back to config.yaml if still at default
if (backendChoice === 'hybrid') {
  try {
    const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const memSection = content.match(/^memory:\s*\n((?:[ \t]*.*\n)*?(?=^\S|\Z))/m);
      if (memSection) {
        const backendMatch = memSection[1].match(/^\s+backend:\s*(\S+)/m);
        if (backendMatch) backendChoice = backendMatch[1].replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}

// 3. Normalize
backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
  ? backendChoice : 'hybrid';
```

### YAML parsing approach

Use a two-step regex match (section then field) instead of a YAML parser:
1. Match `^memory:\s*\n(indented block)` to extract the memory section
2. Match `^\s+backend:\s*(\S+)` within that section

This matches the existing pattern in the codebase (`commands/config.js::readYamlConfig()`
uses hand-rolled regex, not an npm YAML package). The regex handles blank lines
within sections via `((?:[ \t]*.*\n)*?(?=^\S|\Z))`.

## Consequences

### Positive

- Env var (`.mcp.json`) and config.yaml are both respected for the first time
- Priority chain is intuitive: explicit env var > project config > default
- No new dependencies (regex, not a YAML parser)
- `const` binding preserved -- no `TypeError` at runtime
- All subsequent code uses `backendChoice` consistently

### Negative

- Regex YAML parsing is fragile compared to a real parser
- Only reads `memory.backend` -- not a general config reader
- `process.cwd()` assumption: config.yaml must be in working directory

### Risks

- Regex could match a `backend:` key in a different YAML section -- mitigated
  by scoping to the `memory:` block first
- `process.cwd()` may not be the project root if the MCP server starts from
  a different directory -- pre-existing assumption in `memory-initializer.js`
- Unrecognized backend values normalize to `'hybrid'` -- could mask typos

## Alternatives Considered

### 1. Use an npm YAML parser

Rejected: the codebase has no YAML parser dependency. Adding one for a single
field read is excessive. The existing `config.js` already uses hand-rolled
regex parsing.

### 2. Reassign the const backend variable

Rejected: `const { backend = 'hybrid', ... } = options` at line 898 creates
a `const` binding. `backend = process.env...` throws `TypeError: Assignment
to constant variable` at runtime.

### 3. Only read env var, ignore config.yaml

Rejected: `.mcp.json` env block is set by `init` but some users configure
`config.yaml` directly. Ignoring it breaks their workflow. The env var takes
priority, so both can coexist without conflict.

### 4. General-purpose config reader

Rejected: over-engineering for this scope. We need one value (`memory.backend`)
from one file. A general reader would need to handle all config sections,
nested values, type coercion -- all for a patch that should be minimal.

## Implementation

- **Defect**: WM-001 (patch op WM-001a -- config reading at top of `initializeMemoryDatabase()`)
- **Plan**: [memory-wiring-plan.md](../memory-wiring-plan.md), Task 2 "Config consumption"
- **Target file**: `memory/memory-initializer.js` (path var `MI`)
- **Critical detail**: Must use `let backendChoice = backend` (new variable) -- see plan R4-2
