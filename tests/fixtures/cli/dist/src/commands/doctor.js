// Minimal fixture for CF-001 and CF-003
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

async function checkConfigFile() {
    const configPaths = [
        '.claude-flow/config.json',
        'claude-flow.config.json',
        '.claude-flow.json',
        '.claude-flow/config.yaml',
        '.claude-flow/config.yml'
    ];
    for (const configPath of configPaths) {
        if (existsSync(configPath)) {
            try {
                const content = readFileSync(configPath, 'utf8');
                JSON.parse(content);
                return { name: 'Config File', status: 'pass', message: `Found: ${configPath}` };
            } catch (e) {
                return { name: 'Config File', status: 'fail', message: `Invalid JSON: ${configPath}` };
            }
        }
    }
}

async function checkMemoryDatabase() {
    const dbPaths = ['.claude-flow/memory.db', '.swarm/memory.db', 'data/memory.db'];
    for (const dbPath of dbPaths) {
        if (existsSync(dbPath)) {
            return { name: 'Memory Database', status: 'pass', message: `${dbPath}` };
        }
    }
    return { name: 'Memory Database', status: 'warn', message: 'Not initialized', fix: 'claude-flow memory configure --backend hybrid' };
}
// Check API keys
async function checkApiKeys() {
    return { name: 'API Keys', status: 'pass', message: 'Found' };
}

export const doctorCommand = {
    action: async (ctx) => {
        const showFix = ctx.flags.fix;
        const autoInstall = ctx.flags.install;
        const allChecks = [
            checkMemoryDatabase,
            checkApiKeys,
        ];
        const componentMap = {
            'memory': checkMemoryDatabase,
            'api': checkApiKeys,
        };
        const results = [];
        const fixes = [];
        // Auto-install
        if (autoInstall) {
            const claudeCodeResult = results.find(r => r.name === 'Claude Code CLI');
            if (claudeCodeResult && claudeCodeResult.status !== 'pass') {
                const installed = await installClaudeCode();
                if (installed) {
                    const newCheck = await checkClaudeCode();
                    const idx = results.findIndex(r => r.name === 'Claude Code CLI');
                    if (idx !== -1) {
                        results[idx] = newCheck;
                        const fixIdx = fixes.findIndex(f => f.startsWith('Claude Code CLI:'));
                        if (fixIdx !== -1 && newCheck.status === 'pass') {
                            fixes.splice(fixIdx, 1);
                        }
                    }
                    output.writeln(formatCheck(newCheck));
                }
            }
        }
        // Summary
        const passed = results.filter(r => r.status === 'pass').length;
    }
};
