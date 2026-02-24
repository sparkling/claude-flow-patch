# SG-010: Add CLI options to init for all config.json settings
# GitHub: #1205

# ── Op a: Add 13 option declarations after --dual ──
patch("SG-010a: add 13 config option declarations to initCommand",
    INIT_CMD,
    """        {
            name: 'dual',
            description: 'Initialize for both Claude Code and OpenAI Codex',
            type: 'boolean',
            default: false,
        },
    ],
    examples: [""",
    """        {
            name: 'dual',
            description: 'Initialize for both Claude Code and OpenAI Codex',
            type: 'boolean',
            default: false,
        },
        {
            name: 'cache-size',
            description: 'Memory/embedding LRU cache size',
            type: 'number',
            default: 256,
        },
        {
            name: 'coordination-strategy',
            description: 'Swarm coordination strategy',
            type: 'string',
            default: 'consensus',
            choices: ['consensus', 'round-robin', 'priority'],
        },
        {
            name: 'auto-scale',
            description: 'Enable swarm auto-scaling',
            type: 'boolean',
            default: true,
        },
        {
            name: 'mcp-port',
            description: 'MCP server port',
            type: 'number',
            default: 3000,
        },
        {
            name: 'mcp-auto-start',
            description: 'Auto-start MCP server',
            type: 'boolean',
            default: true,
        },
        {
            name: 'memory-backend',
            description: 'Memory storage backend',
            type: 'string',
            default: 'hybrid',
            choices: ['hybrid', 'sqlite', 'agentdb', 'sqljs', 'memory'],
        },
        {
            name: 'neural',
            description: 'Enable neural learning (SONA + ReasoningBank)',
            type: 'boolean',
            default: false,
        },
        {
            name: 'sona-mode',
            description: 'SONA learning mode',
            type: 'string',
            default: 'balanced',
            choices: ['balanced', 'aggressive', 'conservative'],
        },
        {
            name: 'confidence-decay-rate',
            description: 'SONA confidence decay rate',
            type: 'number',
            default: 0.005,
        },
        {
            name: 'consolidation-threshold',
            description: 'Memory consolidation threshold',
            type: 'number',
            default: 10,
        },
        {
            name: 'page-rank-damping',
            description: 'Knowledge graph PageRank damping factor',
            type: 'number',
            default: 0.85,
        },
        {
            name: 'max-memory-nodes',
            description: 'Maximum knowledge graph nodes',
            type: 'number',
            default: 5000,
        },
        {
            name: 'similarity-threshold',
            description: 'Memory graph similarity threshold',
            type: 'number',
            default: 0.8,
        },
    ],
    examples: [""")

# ── Op b: Wire CLI flags into options object ──
patch("SG-010b: wire CLI flags into options.runtime and options.mcp",
    INIT_CMD,
    """    // Handle --skip-claude and --only-claude flags
    if (skipClaude) {""",
    """    // SG-010b: Wire CLI flags into options.runtime/options.mcp
    if (ctx.flags.cacheSize != null) options.runtime.cacheSize = ctx.flags.cacheSize;
    if (ctx.flags.coordinationStrategy) options.runtime.coordinationStrategy = ctx.flags.coordinationStrategy;
    if (ctx.flags.autoScale != null) options.runtime.autoScale = ctx.flags.autoScale;
    if (ctx.flags.memoryBackend) options.runtime.memoryBackend = ctx.flags.memoryBackend;
    if (ctx.flags.neural != null) options.runtime.enableNeural = ctx.flags.neural;
    if (ctx.flags.sonaMode) options.runtime.sonaMode = ctx.flags.sonaMode;
    if (ctx.flags.confidenceDecayRate != null) options.runtime.confidenceDecayRate = ctx.flags.confidenceDecayRate;
    if (ctx.flags.consolidationThreshold != null) options.runtime.consolidationThreshold = ctx.flags.consolidationThreshold;
    if (ctx.flags.pageRankDamping != null) options.runtime.pageRankDamping = ctx.flags.pageRankDamping;
    if (ctx.flags.maxMemoryNodes != null) options.runtime.maxMemoryNodes = ctx.flags.maxMemoryNodes;
    if (ctx.flags.similarityThreshold != null) options.runtime.similarityThreshold = ctx.flags.similarityThreshold;
    if (ctx.flags.mcpPort != null) options.mcp.port = ctx.flags.mcpPort;
    if (ctx.flags.mcpAutoStart != null) options.mcp.autoStart = ctx.flags.mcpAutoStart;
    // Handle --skip-claude and --only-claude flags
    if (skipClaude) {""")

# ── Op c: Wire options into executor config.json template + fix cacheSize ──
patch("SG-010c: wire options into config.json template, fix cacheSize 100→256",
    EXECUTOR,
    """    const configJson = {
        version: '3.0.0',
        swarm: {
            topology: options.runtime.topology || 'hierarchical-mesh',
            maxAgents: options.runtime.maxAgents || 15,
            autoScale: true,
            coordinationStrategy: 'consensus',
        },
        memory: {
            backend: options.runtime.memoryBackend || 'hybrid',
            enableHNSW: options.runtime.enableHNSW !== false,
            cacheSize: 100,
            learningBridge: {
                enabled: !!(options.runtime.enableLearningBridge ?? options.runtime.enableNeural),
                sonaMode: 'balanced',
                confidenceDecayRate: 0.005,
                accessBoostAmount: 0.03,
                consolidationThreshold: 10,
            },
            memoryGraph: {
                enabled: !!(options.runtime.enableMemoryGraph ?? true),
                pageRankDamping: 0.85,
                maxNodes: 5000,
                similarityThreshold: 0.8,
            },
            agentScopes: {
                enabled: !!(options.runtime.enableAgentScopes ?? true),
                defaultScope: 'project',
            },
        },
        neural: {
            enabled: !!options.runtime.enableNeural,
            modelPath: '.claude-flow/neural',
        },
        hooks: {
            enabled: true,
            autoExecute: true,
        },
        mcp: {
            autoStart: options.mcp.autoStart !== false,
            port: options.mcp.port || 3000,
        },
    };""",
    """    // SG-010c: Wire options into config.json template (all keys now configurable via CLI)
    const configJson = {
        version: '3.0.0',
        swarm: {
            topology: options.runtime.topology || 'hierarchical-mesh',
            maxAgents: options.runtime.maxAgents || 15,
            autoScale: options.runtime.autoScale !== false,
            coordinationStrategy: options.runtime.coordinationStrategy || 'consensus',
        },
        memory: {
            backend: options.runtime.memoryBackend || 'hybrid',
            enableHNSW: options.runtime.enableHNSW !== false,
            cacheSize: options.runtime.cacheSize || 256,
            learningBridge: {
                enabled: !!(options.runtime.enableLearningBridge ?? options.runtime.enableNeural),
                sonaMode: options.runtime.sonaMode || 'balanced',
                confidenceDecayRate: options.runtime.confidenceDecayRate ?? 0.005,
                accessBoostAmount: 0.03,
                consolidationThreshold: options.runtime.consolidationThreshold ?? 10,
            },
            memoryGraph: {
                enabled: !!(options.runtime.enableMemoryGraph ?? true),
                pageRankDamping: options.runtime.pageRankDamping ?? 0.85,
                maxNodes: options.runtime.maxMemoryNodes ?? 5000,
                similarityThreshold: options.runtime.similarityThreshold ?? 0.8,
            },
            agentScopes: {
                enabled: !!(options.runtime.enableAgentScopes ?? true),
                defaultScope: options.runtime.defaultScope || 'project',
            },
        },
        neural: {
            enabled: !!options.runtime.enableNeural,
            modelPath: options.runtime.modelPath || '.claude-flow/neural',
        },
        hooks: {
            enabled: options.hooks?.enabled !== false,
            autoExecute: options.hooks?.autoExecute !== false,
        },
        mcp: {
            autoStart: options.mcp.autoStart !== false,
            port: options.mcp.port || 3000,
        },
    };""")

# ── Op d: Add CLI examples ──
patch("SG-010d: add CLI examples for new options",
    INIT_CMD,
    """        { command: 'claude-flow init --dual', description: 'Initialize for both Claude Code and Codex' },
    ],
    action: initAction,""",
    """        { command: 'claude-flow init --dual', description: 'Initialize for both Claude Code and Codex' },
        { command: 'claude-flow init --cache-size 512', description: 'Initialize with larger cache' },
        { command: 'claude-flow init --memory-backend agentdb', description: 'Use AgentDB backend' },
        { command: 'claude-flow init --mcp-port 4000', description: 'Set MCP server port' },
    ],
    action: initAction,""")

# ── Op e: Add 7 option declarations after --similarity-threshold ──
patch("SG-010e: add 7 more config option declarations (topology thru access-boost-amount)",
    INIT_CMD,
    """        {
            name: 'similarity-threshold',
            description: 'Memory graph similarity threshold',
            type: 'number',
            default: 0.8,
        },
    ],
    examples: [""",
    """        {
            name: 'similarity-threshold',
            description: 'Memory graph similarity threshold',
            type: 'number',
            default: 0.8,
        },
        {
            name: 'topology',
            description: 'Swarm topology',
            type: 'string',
            default: 'hierarchical-mesh',
            choices: ['hierarchical-mesh', 'hierarchical', 'mesh', 'ring', 'star'],
        },
        {
            name: 'max-agents',
            description: 'Maximum concurrent agents',
            type: 'number',
            default: 15,
        },
        {
            name: 'enable-hnsw',
            description: 'Enable HNSW vector indexing',
            type: 'boolean',
            default: true,
        },
        {
            name: 'model-path',
            description: 'Neural model storage path',
            type: 'string',
            default: '.claude-flow/neural',
        },
        {
            name: 'hooks',
            description: 'Enable hooks system',
            type: 'boolean',
            default: true,
        },
        {
            name: 'auto-execute',
            description: 'Auto-execute hooks',
            type: 'boolean',
            default: true,
        },
        {
            name: 'access-boost-amount',
            description: 'SONA access boost amount',
            type: 'number',
            default: 0.03,
        },
    ],
    examples: [""")

# ── Op f: Wire 7 new flags into options ──
# NOTE: old_string includes "if (skipClaude) {" to consume SG-010b's preserved comment+code
# and the new_string tags the comment with "(SG-010f)" so SG-010b's old_string no longer matches.
patch("SG-010f: wire 7 new CLI flags into options",
    INIT_CMD,
    """    if (ctx.flags.mcpAutoStart != null) options.mcp.autoStart = ctx.flags.mcpAutoStart;
    // Handle --skip-claude and --only-claude flags
    if (skipClaude) {""",
    """    if (ctx.flags.mcpAutoStart != null) options.mcp.autoStart = ctx.flags.mcpAutoStart;
    if (ctx.flags.topology) options.runtime.topology = ctx.flags.topology;
    if (ctx.flags.maxAgents != null) options.runtime.maxAgents = ctx.flags.maxAgents;
    if (ctx.flags.enableHnsw != null) options.runtime.enableHNSW = ctx.flags.enableHnsw;
    if (ctx.flags.modelPath) options.runtime.modelPath = ctx.flags.modelPath;
    if (ctx.flags.hooks != null) options.hooks.enabled = ctx.flags.hooks;
    if (ctx.flags.autoExecute != null) options.hooks.autoExecute = ctx.flags.autoExecute;
    if (ctx.flags.accessBoostAmount != null) options.runtime.accessBoostAmount = ctx.flags.accessBoostAmount;
    // Handle --skip-claude and --only-claude flags (SG-010f)
    if (skipClaude) {""")

# ── Op g: Wire new keys into executor config.json template (3 sub-patches) ──
patch("SG-010g1: wire accessBoostAmount from options into config.json template",
    EXECUTOR,
    """                accessBoostAmount: 0.03,""",
    """                accessBoostAmount: options.runtime.accessBoostAmount ?? 0.03,""")

patch("SG-010g2: wire hooks.enabled and autoExecute from options into config.json template",
    EXECUTOR,
    """        hooks: {
            enabled: true,
            autoExecute: true,
        },""",
    """        hooks: {
            enabled: options.hooks?.enabled !== false,
            autoExecute: options.hooks?.autoExecute !== false,
        },""")

patch("SG-010g3: wire modelPath from options into config.json template",
    EXECUTOR,
    """            modelPath: '.claude-flow/neural',""",
    """            modelPath: options.runtime.modelPath || '.claude-flow/neural',""")

# ── Op h: Add 2 CLI examples ──
patch("SG-010h: add CLI examples for topology and hooks options",
    INIT_CMD,
    """        { command: 'claude-flow init --mcp-port 4000', description: 'Set MCP server port' },
    ],
    action: initAction,""",
    """        { command: 'claude-flow init --mcp-port 4000', description: 'Set MCP server port' },
        { command: 'claude-flow init --topology mesh --max-agents 8', description: 'Use mesh topology' },
        { command: 'claude-flow init --no-hooks', description: 'Initialize with hooks disabled' },
    ],
    action: initAction,""")

# ── Op j: Deduplicate SG-010b wiring block (stale cache cleanup) ──
# During development, SG-010b's wiring block was duplicated multiple times
# in the live npx cache. This cleanup collapses N consecutive copies into 1.
# MUST run before ops i1-i3 so defaultScope is added to the single surviving block.
import re as _re
try:
    with open(INIT_CMD, 'r') as _f:
        _c = _f.read()
    _sig = '    // SG-010b: Wire CLI flags into options.runtime/options.mcp\n'
    _n = _c.count(_sig)
    if _n > 1:
        _block = (
            r'    // SG-010b: Wire CLI flags into options\.runtime/options\.mcp\n'
            r'(?:    if \(ctx\.flags\.\w+[^\n]*\n)+')
        _dedup_pat = _re.compile(r'(' + _block + r')(?:' + _block + r')+')
        _new_c = _dedup_pat.sub(r'\1', _c)
        if _new_c != _c:
            with open(INIT_CMD, 'w') as _f:
                _f.write(_new_c)
            _n2 = _new_c.count(_sig)
            print(f"  Applied: SG-010j: deduplicate SG-010b wiring ({_n} → {_n2})")
        else:
            print(f"  Skipped: SG-010j: dedup regex did not match")
    elif _n == 1:
        print(f"  Skipped: SG-010j: no duplicates found")
    else:
        print(f"  Skipped: SG-010j: SG-010b not yet applied")
except Exception as _e:
    print(f"  WARN: SG-010j — {_e}")

# ── Op i: Add --default-scope CLI option, wiring, and template ──

# i1: Option declaration — after --access-boost-amount (SG-010e's last entry)
patch("SG-010i1: add --default-scope option declaration",
    INIT_CMD,
    """        {
            name: 'access-boost-amount',
            description: 'SONA access boost amount',
            type: 'number',
            default: 0.03,
        },
    ],
    examples: [""",
    """        {
            name: 'access-boost-amount',
            description: 'SONA access boost amount',
            type: 'number',
            default: 0.03,
        },
        {
            name: 'default-scope',
            description: 'Default agent memory scope',
            type: 'string',
            default: 'project',
        },
    ],
    examples: [""")

# i2: Wire flag into options — after accessBoostAmount (SG-010f's last wiring line)
patch("SG-010i2: wire --default-scope flag into options",
    INIT_CMD,
    """    if (ctx.flags.accessBoostAmount != null) options.runtime.accessBoostAmount = ctx.flags.accessBoostAmount;
    // Handle --skip-claude and --only-claude flags (SG-010f)""",
    """    if (ctx.flags.accessBoostAmount != null) options.runtime.accessBoostAmount = ctx.flags.accessBoostAmount;
    if (ctx.flags.defaultScope) options.runtime.defaultScope = ctx.flags.defaultScope;
    // Handle --skip-claude and --only-claude flags (SG-010f)""")

# i3: Wire into executor config.json template — replace hardcoded 'project'
patch("SG-010i3: wire defaultScope from options into config.json template",
    EXECUTOR,
    """                defaultScope: 'project',""",
    """                defaultScope: options.runtime.defaultScope || 'project',""")
