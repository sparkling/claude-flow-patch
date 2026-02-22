# CF-005: Doctor checkMemoryBackend reads env var + config.yaml instead of config.json
# GitHub: #1194

# ── Op 1: Replace env var + YAML regex with config.json reader ──
patch("CF-005a: checkMemoryBackend reads config.json",
    DOC,
    """    // Read configured backend
    let configuredBackend = 'hybrid';
    if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
        configuredBackend = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
    } else {
        try {
            const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
            if (existsSync(yamlPath)) {
                const content = readFileSync(yamlPath, 'utf-8');
                const memSection = content.match(/^memory:\\s*\\n((?:[ \\t]*.*\\n)*?(?=^\\S|$))/m);
                if (memSection) {
                    const backendMatch = memSection[1].match(/^\\s+backend:\\s*(\\S+)/m);
                    if (backendMatch) configuredBackend = backendMatch[1].replace(/^["']|["']$/g, '');
                }
            }
        } catch {}
    }""",
    """    // CF-005: Read configured backend from config.json
    let configuredBackend = 'hybrid';
    try {
        const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.memory && cfg.memory.backend) configuredBackend = cfg.memory.backend;
        }
    } catch {}""")

# ── Op 2: Update fix message in fail result ──
patch("CF-005b: fix message references config.json",
    DOC,
    """fix: 'npx @claude-flow/cli doctor --install  OR  set backend: sqljs in .claude-flow/config.yaml'""",
    """fix: 'npx @claude-flow/cli doctor --install  OR  set "memory.backend": "sqljs" in .claude-flow/config.json'""")

# ── Op 3: Update workaround message in rebuild failure ──
patch("CF-005c: workaround message references config.json",
    DOC,
    """output.writeln(output.dim('  Workaround: set backend: sqljs in .claude-flow/config.yaml'));""",
    """output.writeln(output.dim('  Workaround: set "memory.backend": "sqljs" in .claude-flow/config.json'));""")
