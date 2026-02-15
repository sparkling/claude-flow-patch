# SG-001: Init generates invalid settings
# GitHub: #1150
#
# Problem: TeammateIdle and TaskCompleted are not valid Claude Code hook events.
# Fix: Replace with SubagentStop (valid event that fires on task completion).

# Single atomic patch: replace invalid hooks with SubagentStop
patch("SG-001a: replace invalid hooks with SubagentStop",
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
    return hooks;""",
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
    // SubagentStop — task completion + teammate idle (replaces invalid TeammateIdle/TaskCompleted)
    hooks.SubagentStop = [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'node .claude/helpers/hook-handler.cjs post-task',
                    timeout: 5000,
                },
                {
                    type: 'command',
                    command: 'npx @claude-flow/cli@latest hooks teammate-idle',
                    timeout: 5000,
                },
            ],
        },
    ];
    // TeammateIdle removed — not a valid Claude Code hook event (see #1150)
    // TaskCompleted removed — not a valid Claude Code hook event (see #1150)
    return hooks;""")

# Fix permission patterns (glob patterns that are too broad)
patch("SG-001b: fix @claude-flow permission pattern",
    SETTINGS_GEN,
    "'Bash(npx @claude-flow*)'",
    "'Bash(npx @claude-flow/cli:*)'")

patch("SG-001c: fix claude-flow permission pattern",
    SETTINGS_GEN,
    "'Bash(npx claude-flow*)'",
    "'Bash(npx claude-flow:*)'")
