# SG-004: init wizard lacks parity with init
# GitHub: #1181
#
# The wizard was implemented as a standalone code path that ignores
# --force, --start-all, --start-daemon, --codex, --dual, and skips
# the already-initialized guard and "Next steps" hints.
#
# 4 ops: init-guard + force (a), codex/dual (b), start-all + next-steps (c),
#         catch-block error handling (d)

# Op 1: Add already-initialized guard + pass --force to executeInit options
patch("SG-004a: wizard init-guard + --force",
    INIT_CMD,
    """        try {
            // Start with base options
            const options = { ...DEFAULT_INIT_OPTIONS, targetDir: ctx.cwd };""",
    """        try {
            // SG-004: Check if already initialized (respects --force)
            const force = ctx.flags.force;
            const initialized = isInitialized(ctx.cwd);
            const hasExisting = initialized.claude || initialized.claudeFlow;
            if (hasExisting && !force) {
                output.printWarning('Claude Flow appears to be already initialized');
                if (initialized.claude) output.printInfo('  Found: .claude/settings.json');
                if (initialized.claudeFlow) output.printInfo('  Found: .claude-flow/config.yaml');
                output.printInfo('Use --force to reinitialize');
                const proceed = await confirm({
                    message: 'Do you want to reinitialize? This will overwrite existing configuration.',
                    default: false,
                });
                if (!proceed) {
                    return { success: true, message: 'Wizard cancelled' };
                }
            }
            // Start with base options
            const options = { ...DEFAULT_INIT_OPTIONS, targetDir: ctx.cwd, force: ctx.flags.force };""")

# Op 2: Add --codex / --dual handling after executeInit succeeds
patch("SG-004b: wizard --codex/--dual support",
    INIT_CMD,
    """            spinner.succeed('Setup complete!');
            // Initialize embeddings if enabled
            let embeddingsInitialized = false;""",
    """            spinner.succeed('Setup complete!');
            // SG-004: Respect --codex / --dual in wizard
            const codexMode = ctx.flags.codex;
            const dualMode = ctx.flags.dual;
            if (codexMode || dualMode) {
                try {
                    output.writeln(output.dim('  Initializing Codex integration...'));
                    await initCodexAction(ctx, { codexMode, dualMode, force: ctx.flags.force, minimal: false, full: false });
                } catch (err) {
                    output.printWarning(`Codex initialization: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            // Initialize embeddings if enabled
            let embeddingsInitialized = false;""")

# Op 3: Add --start-all / --start-daemon + "Next steps" hints before final return
patch("SG-004c: wizard --start-all + next-steps",
    INIT_CMD,
    """            });
            return { success: true, data: result };
        }
        catch (error) {
            if (error instanceof Error && error.message === 'User cancelled') {""",
    """            });
            // SG-004: Respect --start-all / --start-daemon in wizard
            const startAll = ctx.flags['start-all'] || ctx.flags.startAll;
            const startDaemon = ctx.flags['start-daemon'] || ctx.flags.startDaemon || startAll;
            if (startDaemon || startAll) {
                output.writeln();
                output.printInfo('Starting services...');
                const { execSync } = await import('child_process');
                if (startAll) {
                    try {
                        output.writeln(output.dim('  Initializing memory database...'));
                        execSync('npx @claude-flow/cli@latest memory init 2>/dev/null', {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
                        });
                        output.writeln(output.success('  \\u2713 Memory initialized'));
                    } catch { output.writeln(output.dim('  Memory database already exists')); }
                }
                if (startDaemon) {
                    try {
                        output.writeln(output.dim('  Starting daemon...'));
                        execSync('npx @claude-flow/cli@latest daemon start 2>/dev/null &', {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 10000
                        });
                        output.writeln(output.success('  \\u2713 Daemon started'));
                    } catch { output.writeln(output.warning('  Daemon may already be running')); }
                }
                if (startAll) {
                    try {
                        output.writeln(output.dim('  Initializing swarm...'));
                        execSync('npx @claude-flow/cli@latest swarm init --topology hierarchical 2>/dev/null', {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
                        });
                        output.writeln(output.success('  \\u2713 Swarm initialized'));
                    } catch { output.writeln(output.dim('  Swarm initialization skipped')); }
                }
                output.writeln();
                output.printSuccess('All services started');
            }
            else {
                output.writeln(output.bold('Next steps:'));
                output.printList([
                    `Run ${output.highlight('claude-flow daemon start')} to start background workers`,
                    `Run ${output.highlight('claude-flow memory init')} to initialize memory database`,
                    `Run ${output.highlight('claude-flow swarm init')} to initialize a swarm`,
                    `Or re-run with ${output.highlight('--start-all')} to do all of the above`,
                ]);
            }
            return { success: true, data: result };
        }
        catch (error) {
            if (error instanceof Error && error.message === 'User cancelled') {""")

# Op 4: Fix wizard catch block — re-throws instead of clean error message
# spinner is declared inside the try block so we can't call spinner.fail() here
patch("SG-004d: wizard catch block handles errors cleanly",
    INIT_CMD,
    """            if (error instanceof Error && error.message === 'User cancelled') {
                output.printInfo('Setup cancelled');
                return { success: true };
            }
            throw error;""",
    """            if (error instanceof Error && error.message === 'User cancelled') {
                output.printInfo('Setup cancelled');
                return { success: true };
            }
            output.printError(`Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, exitCode: 1 };""")
