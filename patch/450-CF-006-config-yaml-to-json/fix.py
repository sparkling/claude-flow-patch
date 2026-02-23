# CF-006: config.yaml -> config.json migration in start.js, status.js, init.js
# GitHub: #1197 (also covers #1198 CF-007, #1199 CF-008 — merged)

# ── Op 1 (ex CF-006a): Replace isInitialized + parseSimpleYaml + loadConfig in start.js ──
patch("CF-006a: replace YAML parser with config.json reader in start.js",
    START_CMD,
    """// Check if project is initialized
function isInitialized(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return fs.existsSync(configPath);
}
// Simple YAML parser for config (basic implementation)
function parseSimpleYaml(content) {
    const result = {};
    const lines = content.split('\\n');
    const stack = [
        { indent: -1, obj: result }
    ];
    for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '')
            continue;
        const match = line.match(/^(\\s*)(\\w+):\\s*(.*)$/);
        if (!match)
            continue;
        const indent = match[1].length;
        const key = match[2];
        let value = match[3].trim();
        // Parse value
        if (value === '' || value === undefined) {
            value = {};
        }
        else if (value === 'true') {
            value = true;
        }
        else if (value === 'false') {
            value = false;
        }
        else if (value === 'null') {
            value = null;
        }
        else if (!isNaN(Number(value)) && value !== '') {
            value = Number(value);
        }
        else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }
        // Find parent based on indentation
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].obj;
        if (typeof value === 'object' && value !== null) {
            parent[key] = value;
            stack.push({ indent, obj: value, key });
        }
        else {
            parent[key] = value;
        }
    }
    return result;
}
// Load configuration
function loadConfig(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    if (!fs.existsSync(configPath))
        return null;
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return parseSimpleYaml(content);
    }
    catch {
        return null;
    }
}""",
    """// CF-006: Check if project is initialized
function isInitialized(cwd) {
    const jsonPath = path.join(cwd, '.claude-flow', 'config.json');
    return fs.existsSync(jsonPath);
}
// CF-006: Load configuration from config.json
function loadConfig(cwd) {
    const jsonPath = path.join(cwd, '.claude-flow', 'config.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch {
        return null;
    }
}""")

# ── Op 2 (ex CF-007a): Replace isInitialized in status.js ──
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

# ── Op 3 (ex CF-008a): Replace display strings in init.js ──
patch_all("CF-008a: replace config.yaml display strings with config.json",
    INIT_CMD,
    """.claude-flow/config.yaml""",
    """.claude-flow/config.json""")

# ── Op 4 (ex CF-008b): Replace isInitialized in init.js ──
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

# ── Op 5 (ex CF-008c): Replace config.yaml in JSON output path ──
patch("CF-008c: replace config.yaml in JSON output path",
    INIT_CMD,
    """path.join(ctx.cwd, '.claude-flow', 'config.yaml')""",
    """path.join(ctx.cwd, '.claude-flow', 'config.json')""")
