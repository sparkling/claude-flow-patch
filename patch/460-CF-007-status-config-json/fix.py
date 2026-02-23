# CF-007: status.js isInitialized checks config.yaml instead of config.json
# GitHub: #1198

# ── Op 1: Replace isInitialized to check config.json ──
patch("CF-007a: replace isInitialized in status.js to check config.json",
    STATUS_CMD,
    """// Check if project is initialized
function isInitialized(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return fs.existsSync(configPath);
}""",
    """// CF-007: Check if project is initialized
function isInitialized(cwd) {
    const jsonPath = path.join(cwd, '.claude-flow', 'config.json');
    return fs.existsSync(jsonPath);
}""")
