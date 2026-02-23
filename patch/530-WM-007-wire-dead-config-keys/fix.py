# WM-007: Wire dead config.json keys into runtime consumers
# GitHub: #1204

# ── Op a: memory-initializer.js — read cacheSize, enableHNSW, similarityThreshold, defaultScope ──
# Extend the WM-001a config.json read block to extract additional keys,
# then replace the embeddings.json HNSW read and hardcoded defaults.
patch("WM-007a: wire cacheSize/enableHNSW/similarityThreshold/defaultScope from config.json",
    MI,
    """    // WM-001a: Resolve backend choice from config.json (absorbs WM-005)
    let backendChoice = backend;
    try {
        const cfgPath = path.join(process.cwd(), '.claude-flow', 'config.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            if (cfg.memory && cfg.memory.backend) backendChoice = cfg.memory.backend;
        }
    } catch {}""",
    """    // WM-001a: Resolve backend choice from config.json (absorbs WM-005)
    let backendChoice = backend;
    let cfgMemory = {};
    try {
        const cfgPath = path.join(process.cwd(), '.claude-flow', 'config.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            if (cfg.memory && cfg.memory.backend) backendChoice = cfg.memory.backend;
            if (cfg.memory) cfgMemory = cfg.memory;
        }
    } catch {}""")

# Now replace the embeddings.json HNSW block + hardcoded defaults
patch("WM-007a2: replace embeddings.json HNSW read with config.json + wire defaults",
    MI,
    """            // Read HNSW config from embeddings.json
            let enableHNSW = true;
            try {
                const embConfigPath = path.join(process.cwd(), '.claude-flow', 'embeddings.json');
                if (fs.existsSync(embConfigPath)) {
                    const embConfig = JSON.parse(fs.readFileSync(embConfigPath, 'utf-8'));
                    if (embConfig.hnsw === false) enableHNSW = false;
                }
            } catch {}

            // WM-001c: Build HybridBackendConfig with correct keys
            const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
            const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');
            const hybridConfig = {};""",
    """            // WM-007a: Read enableHNSW from config.json (replaces embeddings.json read)
            let enableHNSW = cfgMemory.enableHNSW !== false;

            // WM-001c: Build HybridBackendConfig with correct keys
            const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
            const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');
            const hybridConfig = {};""")

# Replace hardcoded defaultNamespace and semanticThreshold
patch("WM-007a3: wire defaultScope and similarityThreshold from config.json",
    MI,
    """            hybridConfig.defaultNamespace = 'default';
            hybridConfig.semanticThreshold = 0.7;""",
    """            hybridConfig.defaultNamespace = (cfgMemory.agentScopes && cfgMemory.agentScopes.defaultScope) || 'default';
            hybridConfig.semanticThreshold = (cfgMemory.memoryGraph && cfgMemory.memoryGraph.similarityThreshold) || 0.7;""")

# ── Op b: intelligence.js — read learningBridge + memoryGraph config from config.json ──
# Extend the WM-002c config.json read to also extract memory config
patch("WM-007b: wire learningBridge and memoryGraph config from config.json",
    INTEL,
    """    // WM-002c: Read neural.enabled from config.json — skip init when disabled
    let neuralEnabled = true;
    try {
        const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.neural && cfg.neural.enabled === false) neuralEnabled = false;
        }
    } catch (_cfgErr) { /* config read failure is non-fatal */ }
    if (!neuralEnabled) {
        intelligenceInitialized = true;  // MUST set — callers check this flag
        return { success: true, sonaEnabled: false, reasoningBankEnabled: false };
    }
    try {
        // Merge config with defaults
        const finalConfig = {
            ...DEFAULT_SONA_CONFIG,
            ...config
        };""",
    """    // WM-002c: Read neural.enabled from config.json — skip init when disabled
    let neuralEnabled = true;
    let cfgLearningBridge = {};
    let cfgMemoryGraph = {};
    try {
        const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.neural && cfg.neural.enabled === false) neuralEnabled = false;
            if (cfg.memory && cfg.memory.learningBridge) cfgLearningBridge = cfg.memory.learningBridge;
            if (cfg.memory && cfg.memory.memoryGraph) cfgMemoryGraph = cfg.memory.memoryGraph;
        }
    } catch (_cfgErr) { /* config read failure is non-fatal */ }
    if (!neuralEnabled) {
        intelligenceInitialized = true;  // MUST set — callers check this flag
        return { success: true, sonaEnabled: false, reasoningBankEnabled: false };
    }
    try {
        // WM-007b: Merge config.json learningBridge/memoryGraph into SONA config
        const configOverrides = {};
        if (cfgLearningBridge.sonaMode) configOverrides.sonaMode = cfgLearningBridge.sonaMode;
        if (cfgLearningBridge.confidenceDecayRate != null) configOverrides.confidenceDecayRate = cfgLearningBridge.confidenceDecayRate;
        if (cfgLearningBridge.accessBoostAmount != null) configOverrides.accessBoostAmount = cfgLearningBridge.accessBoostAmount;
        if (cfgLearningBridge.consolidationThreshold != null) configOverrides.consolidationThreshold = cfgLearningBridge.consolidationThreshold;
        if (cfgMemoryGraph.pageRankDamping != null) configOverrides.pageRankDamping = cfgMemoryGraph.pageRankDamping;
        if (cfgMemoryGraph.maxNodes != null) configOverrides.maxNodes = cfgMemoryGraph.maxNodes;
        // Merge config with defaults
        const finalConfig = {
            ...DEFAULT_SONA_CONFIG,
            ...configOverrides,
            ...config
        };""")

# ── Op c: intelligence.js — read neural.modelPath from config.json ──
patch("WM-007c: wire neural.modelPath from config.json",
    INTEL,
    """function getDataDir() {
    const cwd = process.cwd();
    const localDir = join(cwd, '.claude-flow', 'neural');
    const homeDir = join(homedir(), '.claude-flow', 'neural');
    // Prefer local directory if .claude-flow exists
    if (existsSync(join(cwd, '.claude-flow'))) {
        return localDir;
    }
    return homeDir;
}""",
    """function getDataDir() {
    const cwd = process.cwd();
    // WM-007c: Read neural.modelPath from config.json
    try {
        const cfgPath = join(cwd, '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.neural && cfg.neural.modelPath) {
                const customDir = join(cwd, cfg.neural.modelPath);
                return customDir;
            }
        }
    } catch {}
    const localDir = join(cwd, '.claude-flow', 'neural');
    const homeDir = join(homedir(), '.claude-flow', 'neural');
    // Prefer local directory if .claude-flow exists
    if (existsSync(join(cwd, '.claude-flow'))) {
        return localDir;
    }
    return homeDir;
}""")

# ── Op d: start.js — read coordinationStrategy from config.json ──
patch("WM-007d: wire coordinationStrategy from config.json into swarm_init",
    START_CMD,
    """        const swarmResult = await callMCPTool('swarm_init', {
            topology: finalTopology,
            maxAgents,
            autoScaling: swarmConfig.autoScale !== false
        });""",
    """        const swarmResult = await callMCPTool('swarm_init', {
            topology: finalTopology,
            maxAgents,
            autoScaling: swarmConfig.autoScale !== false,
            coordinationStrategy: swarmConfig.coordinationStrategy || 'consensus',
        });""")

# ── Op e: hooks-tools.js — read hooks.enabled from config.json ──
# Insert before "// Auto-start daemon if enabled" — matches HK-004 patched form
patch("WM-007e: gate hook execution on hooks.enabled config",
    MCP_HOOKS,
    """        })();
        // Auto-start daemon if enabled
        let daemonStatus = { started: false };""",
    """        })();

        // WM-007e: Check hooks.enabled from config.json
        try {
            const hooksConfigPath = join(process.cwd(), '.claude-flow', 'config.json');
            if (existsSync(hooksConfigPath)) {
                const hCfg = JSON.parse(readFileSync(hooksConfigPath, 'utf-8'));
                if (hCfg.hooks && hCfg.hooks.enabled === false) {
                    return { success: true, skipped: true, reason: 'hooks.enabled is false in config.json' };
                }
            }
        } catch {}

        // Auto-start daemon if enabled
        let daemonStatus = { started: false };""")

# ── Op f: embeddings-tools.js — read memory.cacheSize from config.json ──
patch("WM-007f: wire memory.cacheSize from config.json into embeddings init",
    EMB_TOOLS,
    """            const cacheSize = input.cacheSize || 256;""",
    """            // WM-007f: Read cacheSize from config.json as middle fallback
            let configCacheSize = 256;
            try {
                const embCfgPath = resolve(join(process.cwd(), '.claude-flow', 'config.json'));
                if (existsSync(embCfgPath)) {
                    const embCfg = JSON.parse(readFileSync(embCfgPath, 'utf-8'));
                    if (embCfg.memory && embCfg.memory.cacheSize) configCacheSize = embCfg.memory.cacheSize;
                }
            } catch {}
            const cacheSize = input.cacheSize || configCacheSize || 256;""")

# ── Op g: Gate hooks on autoExecute ──
patch("WM-007g: gate hook execution on hooks.autoExecute config",
    MCP_HOOKS,
    """                if (hCfg.hooks && hCfg.hooks.enabled === false) {
                    return { success: true, skipped: true, reason: 'hooks.enabled is false in config.json' };
                }""",
    """                if (hCfg.hooks && hCfg.hooks.enabled === false) {
                    return { success: true, skipped: true, reason: 'hooks.enabled is false in config.json' };
                }
                if (hCfg.hooks && hCfg.hooks.autoExecute === false) {
                    return { success: true, skipped: true, reason: 'hooks.autoExecute is false in config.json' };
                }""")

# ── Op h: Gate agentScopes.defaultScope on .enabled ──
patch("WM-007h: gate agentScopes.defaultScope on enabled flag",
    MI,
    """            hybridConfig.defaultNamespace = (cfgMemory.agentScopes && cfgMemory.agentScopes.defaultScope) || 'default';""",
    """            hybridConfig.defaultNamespace = (cfgMemory.agentScopes && cfgMemory.agentScopes.enabled !== false && cfgMemory.agentScopes.defaultScope) || 'default';""")

# ── Op i: Gate learningBridge overrides on .enabled ──
patch("WM-007i: gate learningBridge overrides on enabled flag",
    INTEL,
    """        // WM-007b: Merge config.json learningBridge/memoryGraph into SONA config
        const configOverrides = {};
        if (cfgLearningBridge.sonaMode) configOverrides.sonaMode = cfgLearningBridge.sonaMode;
        if (cfgLearningBridge.confidenceDecayRate != null) configOverrides.confidenceDecayRate = cfgLearningBridge.confidenceDecayRate;
        if (cfgLearningBridge.accessBoostAmount != null) configOverrides.accessBoostAmount = cfgLearningBridge.accessBoostAmount;
        if (cfgLearningBridge.consolidationThreshold != null) configOverrides.consolidationThreshold = cfgLearningBridge.consolidationThreshold;
        if (cfgMemoryGraph.pageRankDamping != null) configOverrides.pageRankDamping = cfgMemoryGraph.pageRankDamping;
        if (cfgMemoryGraph.maxNodes != null) configOverrides.maxNodes = cfgMemoryGraph.maxNodes;""",
    """        // WM-007b: Merge config.json learningBridge/memoryGraph into SONA config
        const configOverrides = {};
        if (cfgLearningBridge.enabled !== false) {
            if (cfgLearningBridge.sonaMode) configOverrides.sonaMode = cfgLearningBridge.sonaMode;
            if (cfgLearningBridge.confidenceDecayRate != null) configOverrides.confidenceDecayRate = cfgLearningBridge.confidenceDecayRate;
            if (cfgLearningBridge.accessBoostAmount != null) configOverrides.accessBoostAmount = cfgLearningBridge.accessBoostAmount;
            if (cfgLearningBridge.consolidationThreshold != null) configOverrides.consolidationThreshold = cfgLearningBridge.consolidationThreshold;
        }
        if (cfgMemoryGraph.enabled !== false) {
            if (cfgMemoryGraph.pageRankDamping != null) configOverrides.pageRankDamping = cfgMemoryGraph.pageRankDamping;
            if (cfgMemoryGraph.maxNodes != null) configOverrides.maxNodes = cfgMemoryGraph.maxNodes;
        }""")

# ── Op j: Gate semanticThreshold on memoryGraph.enabled ──
patch("WM-007j: gate semanticThreshold on memoryGraph.enabled flag",
    MI,
    """            hybridConfig.semanticThreshold = (cfgMemory.memoryGraph && cfgMemory.memoryGraph.similarityThreshold) || 0.7;""",
    """            hybridConfig.semanticThreshold = (cfgMemory.memoryGraph && cfgMemory.memoryGraph.enabled !== false && cfgMemory.memoryGraph.similarityThreshold) || 0.7;""")
