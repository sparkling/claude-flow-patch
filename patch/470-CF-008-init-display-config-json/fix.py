# CF-008: init.js isInitialized and display strings reference config.yaml
# GitHub: #1199

# ── Op 1: Replace display strings ".claude-flow/config.yaml" → config.json ──
# Catches 4 display/output references: "Found:" x2, "Config:" box, "V3 Runtime:"
# Does NOT match path.join(..., '.claude-flow', 'config.yaml') since slash is different
patch_all("CF-008a: replace config.yaml display strings with config.json",
    INIT_CMD,
    """.claude-flow/config.yaml""",
    """.claude-flow/config.json""")

# ── Op 2: Replace isInitialized to check config.json only ──
patch("CF-008b: replace isInitialized in init.js to check config.json",
    INIT_CMD,
    """// Check if project is already initialized
function isInitialized(cwd) {
    const claudePath = path.join(cwd, '.claude', 'settings.json');
    const claudeFlowPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return {
        claude: fs.existsSync(claudePath),
        claudeFlow: fs.existsSync(claudeFlowPath),
    };
}""",
    """// CF-008: Check if project is already initialized
function isInitialized(cwd) {
    const claudePath = path.join(cwd, '.claude', 'settings.json');
    const cfJsonPath = path.join(cwd, '.claude-flow', 'config.json');
    return {
        claude: fs.existsSync(claudePath),
        claudeFlow: fs.existsSync(cfJsonPath),
    };
}""")

# ── Op 3: Replace config.yaml in JSON output claudeFlowConfig path ──
patch("CF-008c: replace config.yaml in JSON output path",
    INIT_CMD,
    """path.join(ctx.cwd, '.claude-flow', 'config.yaml')""",
    """path.join(ctx.cwd, '.claude-flow', 'config.json')""")
