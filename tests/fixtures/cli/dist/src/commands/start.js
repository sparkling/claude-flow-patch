// Minimal fixture for SG-005, CF-006 testing
import { output } from '../output.js';
import * as fs from 'fs';
import * as path from 'path';

// Check if project is initialized
function isInitialized(cwd) {
    const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
    return fs.existsSync(configPath);
}
// Simple YAML parser for config (basic implementation)
function parseSimpleYaml(content) {
    const result = {};
    const lines = content.split('\n');
    const stack = [
        { indent: -1, obj: result }
    ];
    for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '')
            continue;
        const match = line.match(/^(\s*)(\w+):\s*(.*)$/);
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
}
// Main start action
const startAction = async (ctx) => {
    return { success: true };
};

const stopCommand = { name: 'stop' };
const restartCommand = { name: 'restart' };

// Quick start subcommand
const quickCommand = {
    name: 'quick',
    aliases: ['q'],
    description: 'Quick start with default settings',
    action: async (ctx) => {
        return startAction(ctx);
    }
};

// start all swarm init call (pre-SG-009k form; 8-space indent matches upstream)
        const swarmResult = await callMCPTool('swarm_init', {
            topology: finalTopology,
            maxAgents,
            autoScaling: swarmConfig.autoScale !== false,
            v3Mode: true
        });

export const startCommand = {
    name: 'start',
    description: 'Start the Claude Flow orchestration system',
    subcommands: [stopCommand, restartCommand, quickCommand],
    options: [],
    examples: [
        { command: 'claude-flow start', description: 'Start with configuration defaults' },
        { command: 'claude-flow start stop', description: 'Stop the running system' }
    ],
    action: startAction
};
