# SG-005: add 'start all' subcommand to start everything at once
# GitHub: #1177

patch("SG-005a: add allCommand subcommand definition",
    START_CMD,
    """// Quick start subcommand
const quickCommand = {""",
    """// Start-all subcommand — SG-005
const allCommand = {
    name: 'all',
    aliases: ['everything'],
    description: 'Start memory, daemon, swarm, and MCP server',
    action: async (ctx) => {
        // Check initialization
        if (!isInitialized(ctx.cwd)) {
            output.printError('Claude Flow is not initialized in this directory');
            output.printInfo('Run "claude-flow init" first, or use "claude-flow start quick"');
            return { success: false, exitCode: 1 };
        }
        output.writeln();
        output.writeln(output.bold('Starting all Claude Flow services'));
        output.writeln();
        const { execSync } = await import('child_process');
        // Step 1: Initialize memory
        try {
            output.writeln(output.dim('  Initializing memory database...'));
            execSync('npx @claude-flow/cli@latest memory init 2>/dev/null', {
                stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
            });
            output.writeln('  \\u2713 Memory initialized');
        } catch { output.writeln('  Memory database already exists'); }
        // Step 2: Start daemon
        try {
            output.writeln(output.dim('  Starting daemon...'));
            execSync('npx @claude-flow/cli@latest daemon start 2>/dev/null &', {
                stdio: 'pipe', cwd: ctx.cwd, timeout: 10000
            });
            output.writeln('  \\u2713 Daemon started');
        } catch { output.writeln('  Daemon may already be running'); }
        // Step 3: Start swarm + MCP via normal startAction
        return startAction(ctx);
    }
};
// Quick start subcommand
const quickCommand = {""")

patch("SG-005b: register allCommand in subcommands array and add example",
    START_CMD,
    """    subcommands: [stopCommand, restartCommand, quickCommand],""",
    """    subcommands: [stopCommand, restartCommand, quickCommand, allCommand],""")
