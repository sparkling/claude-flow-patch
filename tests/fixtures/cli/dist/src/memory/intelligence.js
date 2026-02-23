/**
 * V3 Intelligence Module (fixture)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// WM-007c fixture: getDataDir with hardcoded neural path
function getDataDir() {
    const cwd = process.cwd();
    const localDir = join(cwd, '.claude-flow', 'neural');
    const homeDir = join(homedir(), '.claude-flow', 'neural');
    // Prefer local directory if .claude-flow exists
    if (existsSync(join(cwd, '.claude-flow'))) {
        return localDir;
    }
    return homeDir;
}

// WM-007b fixture: DEFAULT_SONA_CONFIG
const DEFAULT_SONA_CONFIG = {
    instantLoopEnabled: true,
    backgroundLoopEnabled: false,
    loraLearningRate: 0.001,
    loraRank: 8,
    ewcLambda: 0.4,
    maxTrajectorySize: 100,
    patternThreshold: 0.7,
    maxSignals: 10000,
    maxPatterns: 5000
};

let intelligenceInitialized = false;
let sonaCoordinator = null;
let reasoningBank = null;

export async function initializeIntelligence(config) {
    if (intelligenceInitialized) {
        return {
            success: true,
            sonaEnabled: !!sonaCoordinator,
            reasoningBankEnabled: !!reasoningBank
        };
    }
    try {
        // Merge config with defaults
        const finalConfig = {
            ...DEFAULT_SONA_CONFIG,
            ...config
        };
        intelligenceInitialized = true;
        return {
            success: true,
            sonaEnabled: true,
            reasoningBankEnabled: true
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}
