# WM-005: memory-initializer reads config.yaml with hand-rolled regex instead of config.json
# GitHub: #1191

# ── Op 1: Replace env var + YAML regex block with config.json reader ──
patch("WM-005a: config.json reader in initializeMemoryDatabase",
    MI,
    """    // WM-001a: Resolve backend choice (env > config.yaml > options > default)
    let backendChoice = backend;
    if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
        backendChoice = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
    }
    if (backendChoice === 'hybrid') {
        try {
            const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
            if (fs.existsSync(yamlPath)) {
                const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
                const memSection = yamlContent.match(/^memory:\\s*\\n((?:[ \\t]*.*\\n)*?(?=^\\S|$))/m);
                if (memSection) {
                    const backendMatch = memSection[1].match(/^\\s+backend:\\s*(\\S+)/m);
                    if (backendMatch) backendChoice = backendMatch[1].replace(/^["']|["']$/g, '');
                }
            }
        } catch {}
    }
    backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
        ? backendChoice : 'hybrid';""",
    """    // WM-005: Resolve backend choice from config.json (replaces env var + YAML regex)
    let backendChoice = backend;
    try {
        const cfgPath = path.join(process.cwd(), '.claude-flow', 'config.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            if (cfg.memory && cfg.memory.backend) backendChoice = cfg.memory.backend;
        }
    } catch {}
    backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
        ? backendChoice : 'hybrid';""")

# ── Op 2: Update error message to reference config.json ──
patch("WM-005b: error message references config.json",
    MI,
    """console.error('[WM-001] Or set backend: sqljs in .claude-flow/config.yaml');""",
    """console.error('[WM-001] Or set "memory": {"backend": "sqljs"} in .claude-flow/config.json');""")
