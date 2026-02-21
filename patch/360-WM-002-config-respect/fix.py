# WM-002: Neural config gating (neural.enabled not consumed at runtime)
# GitHub: #1185

patch("WM-002c: gate initializeIntelligence on neural.enabled config",
    INTEL,
    """    if (intelligenceInitialized) {
        return {
            success: true,
            sonaEnabled: !!sonaCoordinator,
            reasoningBankEnabled: !!reasoningBank
        };
    }
    try {""",
    """    if (intelligenceInitialized) {
        return {
            success: true,
            sonaEnabled: !!sonaCoordinator,
            reasoningBankEnabled: !!reasoningBank
        };
    }
    // WM-002c: Read neural.enabled from config.yaml — skip init when disabled
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
    } catch (_cfgErr) { /* config read failure is non-fatal */ }
    if (!neuralEnabled) {
        intelligenceInitialized = true;  // MUST set — callers check this flag
        return { success: true, sonaEnabled: false, reasoningBankEnabled: false };
    }
    try {""")

# WM-002d: Fix regex \Z anchor (Python syntax, invalid in JS) in already-applied patch
patch("WM-002d: fix \\\\Z regex anchor in neural config parser",
    INTEL,
    """content.match(/^neural:\\s*\\n((?:[ \\t]*.*\\n)*?(?=^\\S|\\Z))/m)""",
    """content.match(/^neural:\\s*\\n((?:[ \\t]*.*\\n?)*?)(?=^\\S|$)/m)""")
