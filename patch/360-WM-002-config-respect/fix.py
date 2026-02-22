# WM-002: Neural config gating (neural.enabled not consumed at runtime)
# GitHub: #1185

patch("WM-002c: gate initializeIntelligence on neural.enabled config (absorbs WM-006)",
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
    // WM-002c: Read neural.enabled from config.json — skip init when disabled
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
    try {""")

# WM-002d removed: the \Z regex anchor fix targeted YAML regex code that
# WM-002c no longer writes (absorbed WM-006's config.json reader instead).
