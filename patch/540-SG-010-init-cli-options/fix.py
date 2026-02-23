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
