# SG-001: Init generates invalid settings
# GitHub: #1150 | Commit: 94c32ea

# Remove TeammateIdle
patch("SG-001a: remove TeammateIdle",
    SETTINGS_GEN,
    """    // TeammateIdle — auto-assign pending tasks to idle teammates
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
    ];""",
    "    // TeammateIdle removed (invalid hook event, see #1150)")

# Remove TaskCompleted
patch("SG-001b: remove TaskCompleted",
    SETTINGS_GEN,
    """    // TaskCompleted — train patterns and record completion
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
    ];""",
    "    // TaskCompleted removed (invalid hook event, see #1150)")

# Add SubagentStop with teammate-idle
patch("SG-001c: add SubagentStop",
    SETTINGS_GEN,
    """    // SubagentStart — status update
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
    // TeammateIdle removed""",
    """    // SubagentStart — status update
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
    // SubagentStop — replaces invalid TeammateIdle/TaskCompleted (#1150)
    hooks.SubagentStop = [
        {
            hooks: [
                { type: 'command', command: 'node .claude/helpers/hook-handler.cjs post-task', timeout: 5000 },
                { type: 'command', command: 'npx @claude-flow/cli@latest hooks teammate-idle', timeout: 5000 },
            ],
        },
    ];
    // TeammateIdle removed""")

# Fix permission patterns
patch("SG-001d: fix @claude-flow permission", SETTINGS_GEN,
    "'Bash(npx @claude-flow*)'", "'Bash(npx @claude-flow/cli:*)'")

patch("SG-001e: fix claude-flow permission", SETTINGS_GEN,
    "'Bash(npx claude-flow*)'", "'Bash(npx claude-flow:*)'")
