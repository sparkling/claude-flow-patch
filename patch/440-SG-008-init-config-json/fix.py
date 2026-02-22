# SG-008: init should generate .claude-flow/config.json
# GitHub: #1195

# ── Op 1: Add config.json generation after config.yaml write ──
patch("SG-008a: generate config.json in writeRuntimeConfig",
    EXECUTOR,
    """    fs.writeFileSync(configPath, config, 'utf-8');
    result.created.files.push('.claude-flow/config.yaml');
    // Write .gitignore""",
    """    fs.writeFileSync(configPath, config, 'utf-8');
    result.created.files.push('.claude-flow/config.yaml');
    // SG-008: Also generate config.json (canonical runtime config)
    const configJsonPath = path.join(targetDir, '.claude-flow', 'config.json');
    if (!fs.existsSync(configJsonPath) || options.force) {
        const configJson = {
            version: '3.0.0',
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
        };
        fs.writeFileSync(configJsonPath, JSON.stringify(configJson, null, 2) + '\\n', 'utf-8');
        result.created.files.push('.claude-flow/config.json');
    }
    // Write .gitignore""")
