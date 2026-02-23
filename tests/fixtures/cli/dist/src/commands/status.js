// Minimal fixture for CF-007 testing
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Check if project is initialized
function isInitialized(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return fs.existsSync(configPath);
}

function formatUptime(ms) {
    return `${Math.floor(ms / 1000)}s`;
}

export const statusCommand = {
    name: 'status',
    description: 'Show system status',
    action: async (ctx) => {
        return { success: true };
    }
};
