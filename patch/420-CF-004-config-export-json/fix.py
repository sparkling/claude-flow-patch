# CF-004: config get/export uses hand-rolled YAML parser instead of config.json
# GitHub: #1193
#
# The upstream bundler removed the readYamlConfig() definitions but CF-002 added
# call-sites.  Without the definition the CLI crashes on `config get`/`config export`.
# This patch injects a config.json-only readYamlConfig() + required imports.

# ── Op 1: Inject readYamlConfig function + fs/path imports ──
patch("CF-004a: inject readYamlConfig that reads config.json",
    CONF,
    """import { confirm } from '../prompt.js';
// Init configuration""",
    """import { confirm } from '../prompt.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// CF-004: Read project config from .claude-flow/config.json
function readYamlConfig() {
    const jsonPath = join(process.cwd(), '.claude-flow', 'config.json');
    if (existsSync(jsonPath)) {
        try { return JSON.parse(readFileSync(jsonPath, 'utf-8')); } catch {}
    }
    return {};
}
// Init configuration""")
