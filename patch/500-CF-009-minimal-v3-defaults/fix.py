# CF-009: Upgrade MINIMAL init preset to v3 runtime defaults
# GitHub: #1203

# CF-009a: MINIMAL runtime block -> v3 defaults
# Include surrounding context (agents.all: false) to disambiguate from DEFAULT_INIT_OPTIONS
# which already has the identical runtime block we're replacing TO.
patch("CF-009a: MINIMAL runtime to v3 defaults",
    TYPES,
    """        all: false,
    },
    runtime: {
        topology: 'mesh',
        maxAgents: 5,
        memoryBackend: 'memory',
        enableHNSW: false,
        enableNeural: false,
        enableLearningBridge: false,
        enableMemoryGraph: false,
        enableAgentScopes: false,
    },""",
    """        all: false,
    },
    runtime: {
        topology: 'hierarchical-mesh',
        maxAgents: 15,
        memoryBackend: 'hybrid',
        enableHNSW: true,
        enableNeural: true,
        enableLearningBridge: true,
        enableMemoryGraph: true,
        enableAgentScopes: true,
    },""")
