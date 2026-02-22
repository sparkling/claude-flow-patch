# WM-006: intelligence.js reads neural.enabled from config.yaml regex instead of config.json
# GitHub: #1192

# ── Op 1: Replace YAML regex with config.json reader for neural.enabled ──
patch("WM-006a: config.json reader for neural.enabled",
    INTEL,
    """    // WM-002c: Read neural.enabled from config.yaml — skip init when disabled
    let neuralEnabled = true;
    try {
        const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
        if (existsSync(yamlPath)) {
            const content = readFileSync(yamlPath, 'utf-8');
            const neuralSection = content.match(/^neural:\\s*\\n((?:[ \\t]*.*\\n?)*?)(?=^\\S|$)/m);
            if (neuralSection) {
                const enabledMatch = neuralSection[1].match(/^\\s+enabled:\\s*(\\S+)/m);
                if (enabledMatch) neuralEnabled = enabledMatch[1] !== 'false';
            }
        }
    } catch (_cfgErr) { /* config read failure is non-fatal */ }""",
    """    // WM-006: Read neural.enabled from config.json — skip init when disabled
    let neuralEnabled = true;
    try {
        const cfgPath = join(process.cwd(), '.claude-flow', 'config.json');
        if (existsSync(cfgPath)) {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            if (cfg.neural && cfg.neural.enabled === false) neuralEnabled = false;
        }
    } catch (_cfgErr) { /* config read failure is non-fatal */ }""")
