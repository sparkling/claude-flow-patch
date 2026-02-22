// Minimal fixture for CF-002, CF-004
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Helper to read config.yaml if it exists
function readYamlConfig() {
    const configPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    if (!existsSync(configPath)) { return {}; }
    try {
        const content = readFileSync(configPath, 'utf8');
        const config = {};
        const lines = content.split('\n');
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (!trimmed.includes(':')) continue;
            const indent = line.match(/^\s*/)[0].length;
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
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Helper to read config.yaml if it exists
function readYamlConfig() {
    const configPath = join(process.cwd(), '.claude-flow', 'config.yaml');
    if (!existsSync(configPath)) { return {}; }
    try {
        const content = readFileSync(configPath, 'utf8');
        const config = {};
        const lines = content.split('\n');
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (!trimmed.includes(':')) continue;
            const indent = line.match(/^\s*/)[0].length;
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
}
