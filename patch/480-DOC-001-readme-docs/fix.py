# DOC-001: Update upstream README.md to match patched CLI behavior
# GitHub: #1201

# ── Op a: Doctor table — "Valid JSON/YAML" → "Valid JSON" ──
patch("DOC-001a: doctor table — JSON only (YAML support removed)",
    README_MD,
    """| **Config file validity** | Valid JSON/YAML | ✅ Regenerates defaults |""",
    """| **Config file validity** | Valid JSON | ✅ Regenerates defaults |""")

# ── Op b: Doctor commands — insert --install before --verbose ──
patch("DOC-001b: doctor commands — add --install option",
    README_MD,
    """# Verbose output
npx ruflo@v3alpha doctor --verbose""",
    """# Auto-install missing native dependencies
npx ruflo@v3alpha doctor --install

# Verbose output
npx ruflo@v3alpha doctor --verbose""")

# ── Op c: Doctor output — config path + memory backend line ──
patch("DOC-001c: doctor output — config path + memory backend",
    README_MD,
    """✅ Config       Valid claude-flow.config.json
✅ Daemon       Running (PID: 12345)""",
    """✅ Config       Valid .claude-flow/config.json
✅ Mem Backend  hybrid (HybridBackend)
✅ Daemon       Running (PID: 12345)""")

# ── Op d: Env var table — config path ──
patch("DOC-001d: env var default — .claude-flow/config.json",
    README_MD,
    """| `CLAUDE_FLOW_CONFIG` | Path to configuration file | `./claude-flow.config.json` |""",
    """| `CLAUDE_FLOW_CONFIG` | Path to configuration file | `./.claude-flow/config.json` |""")

# ── Op e: Config location — add .claude-flow/config.json as primary ──
patch("DOC-001e: config location — .claude-flow/config.json primary",
    README_MD,
    """1. `./claude-flow.config.json` (project root)
2. `~/.config/ruflo/config.json` (user config)
3. Environment variables (override any file config)""",
    """1. `./.claude-flow/config.json` (project directory)
2. `./claude-flow.config.json` (legacy, project root)
3. `~/.config/ruflo/config.json` (user config)
4. Environment variables (override any file config)""")

# ── Op f: Memory schema — type→backend, add syncMode/learningBridge/memoryGraph/agentScopes ──
patch("DOC-001f: memory schema — backend key + new fields",
    README_MD,
    """  "memory": {
    "type": "hybrid",
    "path": "./data",
    "maxEntries": 10000,
    "ttl": 86400,
    "hnsw": {
      "m": 16,
      "ef": 200,
      "efConstruction": 200
    },
    "encryption": {
      "enabled": false,
      "algorithm": "aes-256-gcm"
    }
  },""",
    """  "memory": {
    "backend": "hybrid",
    "syncMode": "eventual",
    "maxEntries": 10000,
    "ttl": 86400,
    "hnsw": {
      "m": 16,
      "ef": 200,
      "efConstruction": 200
    },
    "learningBridge": true,
    "memoryGraph": true,
    "agentScopes": true,
    "encryption": {
      "enabled": false,
      "algorithm": "aes-256-gcm"
    }
  },""")

# ── Op g: Neural note — insert before "Configuration by Use Case" ──
patch("DOC-001g: neural note — neural.enabled disables SONA",
    README_MD,
    """### Configuration by Use Case""",
    """> **Note:** Setting `"neural": { "enabled": false }` disables SONA and ReasoningBank subsystems at runtime.

### Configuration by Use Case""")

# ── Op h: Breaking changes table — config path ──
patch("DOC-001h: breaking changes — .claude-flow/config.json",
    README_MD,
    """| **Config Format** | `.ruflo/config.json` | `claude-flow.config.json` | Update path |""",
    """| **Config Format** | `.ruflo/config.json` | `.claude-flow/config.json` | Update path |""")

# ── Op i: V3 config example — path + type→backend ──
patch("DOC-001i: V3 config example — path + backend key",
    README_MD,
    """**V3 Config (`claude-flow.config.json`)**:
```json
{
  "version": "3.0.0",
  "memory": {
    "type": "hybrid",
    "path": "./data",
    "hnsw": { "m": 16, "ef": 200 }
  },""",
    """**V3 Config (`.claude-flow/config.json`)**:
```json
{
  "version": "3.0.0",
  "memory": {
    "backend": "hybrid",
    "syncMode": "eventual",
    "hnsw": { "m": 16, "ef": 200 }
  },""")

# ── Op j: Migration issues — create config.json ──
patch("DOC-001j: migration issues — create .claude-flow/config.json",
    README_MD,
    """| `Config not found` | Path change | Rename to `claude-flow.config.json` |""",
    """| `Config not found` | Path change | Create `.claude-flow/config.json` (or run `init`) |""")

# ── Op k: Dev config — type→backend (include swarm line for uniqueness) ──
patch("DOC-001k: dev config — backend key",
    README_MD,
    """  "memory": { "type": "sqlite", "path": "./dev-data" },
  "swarm": { "topology": "mesh", "maxAgents": 5 },""",
    """  "memory": { "backend": "sqlite" },
  "swarm": { "topology": "mesh", "maxAgents": 5 },""")

# ── Op l: Prod config — type→backend ──
patch("DOC-001l: prod config — backend key",
    README_MD,
    """  "memory": {
    "type": "hybrid",
    "path": "/var/lib/ruflo/data",
    "encryption": { "enabled": true, "algorithm": "aes-256-gcm" }
  },""",
    """  "memory": {
    "backend": "hybrid",
    "encryption": { "enabled": true, "algorithm": "aes-256-gcm" }
  },""")

# ── Op m: CI config — type→backend (include swarm line for uniqueness) ──
patch("DOC-001m: CI config — backend key",
    README_MD,
    """  "memory": { "type": "sqlite", "path": ":memory:" },
  "swarm": { "topology": "mesh", "maxAgents": 3 },""",
    """  "memory": { "backend": "sqlite" },
  "swarm": { "topology": "mesh", "maxAgents": 3 },""")

# ── Op n: Mem-constrained config — type→backend ──
patch("DOC-001n: mem-constrained config — backend key",
    README_MD,
    """  "memory": {
    "type": "sqlite",
    "maxEntries": 1000,
    "hnsw": { "m": 8, "ef": 100 }
  },""",
    """  "memory": {
    "backend": "sqlite",
    "maxEntries": 1000,
    "hnsw": { "m": 8, "ef": 100 }
  },""")

# ── Op o: Remove --v3-mode from example (line 2637) ──
patch("DOC-001o: remove --v3-mode from swarm init example",
    README_MD,
    """# Initialize swarm with V3 mode
npx ruflo@v3alpha swarm init --v3-mode""",
    """# Initialize swarm
npx ruflo@v3alpha swarm init""")

# ── Op p: Update env var topology default (line 6690) ──
patch("DOC-001p: env var topology default to hierarchical-mesh",
    README_MD,
    """| `CLAUDE_FLOW_TOPOLOGY` | Default swarm topology (`hierarchical`, `mesh`, `ring`, `star`) | `hierarchical` |""",
    """| `CLAUDE_FLOW_TOPOLOGY` | Default swarm topology (`hierarchical-mesh`, `hierarchical`, `mesh`, `ring`, `star`) | `hierarchical-mesh` |""")

# ── Op q1: Anti-drift recommended config (line 361) ──
# Use surrounding JS context to uniquely identify this block
patch("DOC-001q1: anti-drift topology to hierarchical-mesh",
    README_MD,
    """// Anti-drift defaults (ALWAYS use for coding tasks)
swarm_init({
  topology: "hierarchical",  // Single coordinator enforces alignment
  maxAgents: 8,              // Smaller team = less drift surface""",
    """// Anti-drift defaults (ALWAYS use for coding tasks)
swarm_init({
  topology: "hierarchical-mesh",  // Hybrid coordinator enforces alignment
  maxAgents: 8,                   // Smaller team = less drift surface""")

# ── Op q2: createSwarm TypeScript example (line 4232) ──
patch("DOC-001q2: createSwarm topology to hierarchical-mesh",
    README_MD,
    """// Create a hierarchical swarm
const swarm = await createSwarm({
  topology: 'hierarchical',
  maxAgents: 8,""",
    """// Create a hierarchical-mesh swarm
const swarm = await createSwarm({
  topology: 'hierarchical-mesh',
  maxAgents: 8,""")

# ── Op q3: Full config reference (line 6859) ──
# Use heartbeatInterval line for unique context
patch("DOC-001q3: full config ref topology to hierarchical-mesh",
    README_MD,
    """  "swarm": {
    "topology": "hierarchical",
    "maxAgents": 15,
    "strategy": "specialized",
    "heartbeatInterval": 5000,""",
    """  "swarm": {
    "topology": "hierarchical-mesh",
    "maxAgents": 15,
    "strategy": "specialized",
    "heartbeatInterval": 5000,""")

# ── Op q4: Production config (line 6990) ──
# Use security mode line for unique context
patch("DOC-001q4: production config topology to hierarchical-mesh",
    README_MD,
    """  "swarm": { "topology": "hierarchical", "maxAgents": 15 },
  "security": {
    "mode": "strict",
    "rateLimit": { "enabled": true, "maxRequests": 100 }""",
    """  "swarm": { "topology": "hierarchical-mesh", "maxAgents": 15 },
  "security": {
    "mode": "strict",
    "rateLimit": { "enabled": true, "maxRequests": 100 }""")

# ── Op q5: Getting started config (line 7221) ──
# Use neural line for unique context
patch("DOC-001q5: getting started topology to hierarchical-mesh",
    README_MD,
    """  "swarm": {
    "topology": "hierarchical",
    "maxAgents": 15,
    "strategy": "specialized"
  },
  "security": { "mode": "strict" },
  "neural": { "enabled": true, "sona": true }""",
    """  "swarm": {
    "topology": "hierarchical-mesh",
    "maxAgents": 15,
    "strategy": "specialized"
  },
  "security": { "mode": "strict" },
  "neural": { "enabled": true, "sona": true }""")

# ── Op r: Self-learning workflow (line 616) ──
patch("DOC-001r: self-learning workflow topology to hierarchical-mesh",
    README_MD,
    """2. COORD:   swarm_init(topology="hierarchical") → Set up coordination""",
    """2. COORD:   swarm_init(topology="hierarchical-mesh") → Set up coordination""")

# ── Op s: Feature development example (line 2801) ──
patch("DOC-001s: feature dev topology to hierarchical-mesh",
    README_MD,
    """swarm init --topology hierarchical && npx ruflo@v3alpha task orchestrate""",
    """swarm init --topology hierarchical-mesh && npx ruflo@v3alpha task orchestrate""")

# ── Op t: Shell example (line 5480) ──
patch("DOC-001t: nexus deploy topology to hierarchical-mesh",
    README_MD,
    """  --topology hierarchical \\
  --max-agents 50""",
    """  --topology hierarchical-mesh \\
  --max-agents 50""")
