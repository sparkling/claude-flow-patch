# SG-008: init should generate .claude-flow/config.json (not config.yaml)
# GitHub: #1195, #1200

# ── Op 1: Replace config.yaml generation with config.json in writeRuntimeConfig ──
patch("SG-008a: replace yaml generation with config.json in writeRuntimeConfig",
    EXECUTOR,
    """    const configPath = path.join(targetDir, '.claude-flow', 'config.yaml');
    if (fs.existsSync(configPath) && !options.force) {
        result.skipped.push('.claude-flow/config.yaml');
        return;
    }
    const config = `# Claude Flow V3 Runtime Configuration
# Generated: ${new Date().toISOString()}

version: "3.0.0"

swarm:
  topology: ${options.runtime.topology}
  maxAgents: ${options.runtime.maxAgents}
  autoScale: true
  coordinationStrategy: consensus

memory:
  backend: ${options.runtime.memoryBackend}
  enableHNSW: ${options.runtime.enableHNSW}
  cacheSize: 100
  # ADR-049: Self-Learning Memory
  learningBridge:
    enabled: ${options.runtime.enableLearningBridge ?? options.runtime.enableNeural}
    sonaMode: balanced
    confidenceDecayRate: 0.005
    accessBoostAmount: 0.03
    consolidationThreshold: 10
  memoryGraph:
    enabled: ${options.runtime.enableMemoryGraph ?? true}
    pageRankDamping: 0.85
    maxNodes: 5000
    similarityThreshold: 0.8
  agentScopes:
    enabled: ${options.runtime.enableAgentScopes ?? true}
    defaultScope: project

neural:
  enabled: ${options.runtime.enableNeural}
  modelPath: .claude-flow/neural

hooks:
  enabled: true
  autoExecute: true

mcp:
  autoStart: ${options.mcp.autoStart}
  port: ${options.mcp.port}
`;
    fs.writeFileSync(configPath, config, 'utf-8');
    result.created.files.push('.claude-flow/config.yaml');
    // Write .gitignore""",
    """    // SG-008: Generate config.json (canonical runtime config, replaces config.yaml)
    const configJsonPath = path.join(targetDir, '.claude-flow', 'config.json');
    if (fs.existsSync(configJsonPath) && !options.force) {
        result.skipped.push('.claude-flow/config.json');
        return;
    }
    const configJson = {
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
    };
    fs.writeFileSync(configJsonPath, JSON.stringify(configJson, null, 2) + '\\n', 'utf-8');
    result.created.files.push('.claude-flow/config.json');
    // Write .gitignore""")

# ── Op 2: Update CAPABILITIES.md template to reference config.json ──
patch("SG-008b: update CAPABILITIES.md template from config.yaml to config.json",
    EXECUTOR,
    """config.yaml      # Runtime configuration""",
    """config.json      # Runtime configuration""")
