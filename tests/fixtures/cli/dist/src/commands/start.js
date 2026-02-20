// Minimal fixture for SG-005 testing
import { output } from '../output.js';

function isInitialized(cwd) {
    return false;
}

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

export const startCommand = {
    name: 'start',
    description: 'Start the Claude Flow orchestration system',
    subcommands: [stopCommand, restartCommand, quickCommand],
    options: [],
    examples: [
        { command: 'claude-flow start', description: 'Start with configuration defaults' },
    ],
    action: startAction
};
