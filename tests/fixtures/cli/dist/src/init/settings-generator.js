// Minimal fixture for SG-001 testing
export function generateSettings(options) {
    const settings = {};
    if (options.components.settings) {
        settings.hooks = generateHooksConfig(options.hooks);
    }
    if (options.statusline.enabled) {
        settings.statusLine = generateStatusLineConfig(options);
    }
    settings.permissions = {
        allow: [
            'Bash(npx @claude-flow*)',
            'Bash(npx claude-flow*)',
            'Bash(node .claude/*)',
            'mcp__claude-flow__:*',
        ],
    };
    // SubagentStart — status update
    hooks.SubagentStart = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node .claude/helpers/hook-handler.cjs status',
                    timeout: 3000,
                },
            ],
        },
    ];
    // TeammateIdle — auto-assign pending tasks to idle teammates
    hooks.TeammateIdle = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node .claude/helpers/hook-handler.cjs post-task',
                    timeout: 5000,
                },
            ],
        },
    ];
    // TaskCompleted — train patterns and record completion
    hooks.TaskCompleted = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node .claude/helpers/hook-handler.cjs post-task',
                    timeout: 5000,
                },
            ],
        },
    ];
    return hooks;
}
