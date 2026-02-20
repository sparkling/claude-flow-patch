// Minimal fixture for SG-004 command registry testing
import { initCommand } from './init.js';
import { startCommand } from './start.js';

const commandLoaders = {
    init: () => import('./init.js'),
    start: () => import('./start.js'),
};

const loadedCommands = new Map();
loadedCommands.set('init', initCommand);
loadedCommands.set('start', startCommand);

export const commands = [
    initCommand,
    startCommand,
];

export const commandsByCategory = {
    primary: [
        initCommand,
        startCommand,
    ],
};
