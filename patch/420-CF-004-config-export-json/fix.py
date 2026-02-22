# CF-004: config get/export uses hand-rolled YAML parser instead of config.json
# GitHub: #1193

# ── Op 1: Replace readYamlConfig() with readProjectConfig() that reads config.json ──
patch("CF-004a: readProjectConfig reads config.json",
    CONF,
    """// Helper to read config.yaml if it exists
function readYamlConfig() {
    const configPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    if (!existsSync(configPath)) { return {}; }
    try {
        const content = readFileSync(configPath, 'utf8');
        const config = {};
        const lines = content.split('\\n');
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (!trimmed.includes(':')) continue;
            const indent = line.match(/^\\s*/)[0].length;
            if (indent === 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[key.trim()] = value.replace(/^["']|["']$/g, '');
                } else {
                    currentSection = key.trim();
                    config[currentSection] = {};
                }
            } else if (currentSection && indent > 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[currentSection][key.trim()] = value.replace(/^["']|["']$/g, '');
                }
            }
        }
        return config;
    } catch (error) { return {}; }
}""",
    """// CF-004: Read config.json (canonical) with config.yaml fallback
function readYamlConfig() {
    // Primary: config.json
    const jsonPath = join(process.cwd(), '.claude-flow', 'config.json');
    if (existsSync(jsonPath)) {
        try {
            return JSON.parse(readFileSync(jsonPath, 'utf-8'));
        } catch {}
    }
    // Fallback: config.yaml (legacy)
    const yamlPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    if (!existsSync(yamlPath)) { return {}; }
    try {
        const content = readFileSync(yamlPath, 'utf8');
        const config = {};
        const lines = content.split('\\n');
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (!trimmed.includes(':')) continue;
            const indent = line.match(/^\\s*/)[0].length;
            if (indent === 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[key.trim()] = value.replace(/^["']|["']$/g, '');
                } else {
                    currentSection = key.trim();
                    config[currentSection] = {};
                }
            } else if (currentSection && indent > 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[currentSection][key.trim()] = value.replace(/^["']|["']$/g, '');
                }
            }
        }
        return config;
    } catch (error) { return {}; }
}""")

# ── Op 2: Remove duplicate readYamlConfig (bundler artifact: same function emitted twice) ──
# The upstream TypeScript bundler emits readYamlConfig twice with its imports.
# Op 1 replaced the first copy; this removes the second copy + its duplicate imports.
patch("CF-004b: remove duplicate readYamlConfig + imports",
    CONF,
    """import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Helper to read config.yaml if it exists
function readYamlConfig() {
    const configPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    if (!existsSync(configPath)) { return {}; }
    try {
        const content = readFileSync(configPath, 'utf8');
        const config = {};
        const lines = content.split('\\n');
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (!trimmed.includes(':')) continue;
            const indent = line.match(/^\\s*/)[0].length;
            if (indent === 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[key.trim()] = value.replace(/^["']|["']$/g, '');
                } else {
                    currentSection = key.trim();
                    config[currentSection] = {};
                }
            } else if (currentSection && indent > 0) {
                const [key, ...rest] = trimmed.split(':');
                const value = rest.join(':').trim();
                if (value && value !== '') {
                    config[currentSection][key.trim()] = value.replace(/^["']|["']$/g, '');
                }
            }
        }
        return config;
    } catch (error) { return {}; }
}""",
    """// CF-004b: removed duplicate readYamlConfig (bundler artifact)""")
