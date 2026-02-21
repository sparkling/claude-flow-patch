// Minimal fixture for SG-003 / SG-004 testing
import { executeInit, DEFAULT_INIT_OPTIONS } from '../init/index.js';

const initAction = async (ctx) => {
    const codexMode = ctx.flags.codex;
    const dualMode = ctx.flags.dual;
    const cwd = ctx.cwd;
    // If codex mode, use the Codex initializer
    if (codexMode || dualMode) {
        return initCodexAction(ctx, { codexMode, dualMode, force, minimal, full });
    }
};

// Wizard subcommand for interactive setup
const wizardCommand = {
    name: 'wizard',
    description: 'Interactive setup wizard for comprehensive configuration',
    action: async (ctx) => {
        output.writeln();
        output.writeln(output.bold('Claude Flow V3 Setup Wizard'));
        output.writeln(output.dim('Answer questions to configure your project'));
        output.writeln();
        try {
            // Start with base options
            const options = { ...DEFAULT_INIT_OPTIONS, targetDir: ctx.cwd };
            // Configuration preset
            const preset = 'default';
            const result = await executeInit(options);
            if (!result.success) {
                return { success: false, exitCode: 1 };
            }
            spinner.succeed('Setup complete!');
            // Initialize embeddings if enabled
            let embeddingsInitialized = false;
            // Summary table
            output.printTable({
                columns: [
                    { key: 'setting', header: 'Setting', width: 20 },
                    { key: 'value', header: 'Value', width: 40 },
                ],
                data: [
                    { setting: 'Preset', value: preset },
                ],
            });
            return { success: true, data: result };
        }
        catch (error) {
            if (error instanceof Error && error.message === 'User cancelled') {
                output.printInfo('Setup cancelled');
                return { success: true };
            }
            throw error;
        }
    },
};

// SG-006 fixture: hooks assignment block ending (old_string for SG-006b)
                    options.hooks.notification = hooks.includes('notification');
                }

// SG-006 fixture: hardcoded topology in wizard --start-all (old_string for SG-006c)
                        execSync('npx @claude-flow/cli@latest swarm init --topology hierarchical 2>/dev/null', {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
                        });
