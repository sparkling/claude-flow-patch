# SG-001: Init generates invalid settings
# GitHub: #1150
#
# Problems:
# 1. TeammateIdle and TaskCompleted are not valid Claude Code hook events
# 2. Permission patterns are too broad (glob wildcards)
# 3. Hook paths use relative .claude/helpers/ which breaks from subdirectories
#
# Fix: Replace invalid hooks with SubagentStop, fix permissions, use $CLAUDE_PROJECT_DIR

# SG-001a: Replace invalid hooks with SubagentStop (with correct $CLAUDE_PROJECT_DIR paths)
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
                    command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs status',
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
                    command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-task',
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

# SG-001b: Fix permission patterns (too broad) and add $CLAUDE_PROJECT_DIR
patch("SG-001b: fix permissions",
    SETTINGS_GEN,
    """    settings.permissions = {
        allow: [
            'Bash(npx @claude-flow*)',
            'Bash(npx claude-flow*)',
            'Bash(node .claude/*)',
            'mcp__claude-flow__:*',
        ],""",
    """    settings.permissions = {
        allow: [
            'Bash(npx @claude-flow/cli:*)',
            'Bash(npx claude-flow:*)',
            'Bash(node "$CLAUDE_PROJECT_DIR"/.claude/*)',
            'mcp__claude-flow__:*',
        ],""")

# SG-001c: Fix all other hook paths to use $CLAUDE_PROJECT_DIR
# (catches statusline, pre-bash, post-edit, route, session hooks, etc.)
patch_all("SG-001c: use CLAUDE_PROJECT_DIR for all hook paths",
    SETTINGS_GEN,
    "command: 'node .claude/helpers/",
    'command: \'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/')

# SG-001d: statusLine config emitted even when statusline component is off
# MINIMAL_INIT_OPTIONS has components.statusline=false but statusline.enabled=true.
# Settings-generator checks statusline.enabled, emitting statusLine config for a
# file that won't exist. Gate on components.statusline too.
patch("SG-001d: only emit statusLine when statusline component is generated",
    SETTINGS_GEN,
    """    if (options.statusline.enabled) {""",
    """    // SG-001: Only emit statusLine config if the component will actually be generated
    if (options.components.statusline && options.statusline.enabled) {""")

# SG-001e: MINIMAL_INIT_OPTIONS inherits statusline.enabled=true from DEFAULT
# but sets components.statusline=false. Override to prevent inconsistency.
# (SG-001d guards at the consumer; this fixes the producer for MINIMAL)
patch("SG-001e: MINIMAL statusline.enabled matches components.statusline",
    TYPES,
    """    hooks: {
        ...DEFAULT_INIT_OPTIONS.hooks,
        userPromptSubmit: false,
        stop: false,
        notification: false,
    },
    skills: {""",
    """    hooks: {
        ...DEFAULT_INIT_OPTIONS.hooks,
        userPromptSubmit: false,
        stop: false,
        notification: false,
    },
    // SG-001: statusline file not generated (components.statusline: false)
    // so disable the feature flag to prevent dangling settings.json references
    statusline: {
        ...DEFAULT_INIT_OPTIONS.statusline,
        enabled: false,
    },
    skills: {""")
