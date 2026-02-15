# SG-001: Settings generator outputs invalid Claude Code hook events
# GitHub: #1150
# Introduced: 94c32ea (Feb 12, 2026)

# Op 1: Remove TeammateIdle block (lines 304-315 in source)
patch("1: remove TeammateIdle",
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
    "    // TeammateIdle removed — not a valid Claude Code hook event (see #1150)")

# Op 2: Remove TaskCompleted block (lines 316-327 in source)
patch("2: remove TaskCompleted",
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
    "    // TaskCompleted removed — not a valid Claude Code hook event (see #1150)")

# Op 3: Enhance SubagentStop to include teammate-idle for auto-assignment
patch("3: enhance SubagentStop with teammate-idle",
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
    // TeammateIdle removed""")
