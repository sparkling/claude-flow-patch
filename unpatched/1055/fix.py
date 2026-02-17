# 1055: hooks pre-task requires --task-id
# GitHub: #1055

patch("1055a: pre-task option task-id is optional",
    HOOKS_CMD,
    """{
            name: 'task-id',
            short: 'i',
            description: 'Unique task identifier',
            type: 'string',
            required: true
        },""",
    """{
            name: 'task-id',
            short: 'i',
            description: 'Unique task identifier',
            type: 'string',
            required: false
        },""")

patch("1055b: auto-generate task-id when omitted",
    HOOKS_CMD,
    "const taskId = ctx.flags.taskId;",
    "const taskId = ctx.flags.taskId || `task-${Date.now()}`;")

patch("1055c: require description only",
    HOOKS_CMD,
    """        if (!taskId || !description) {
            output.printError('Task ID and description are required.');
            return { success: false, exitCode: 1 };
        }""",
    """        if (!description) {
            output.printError('Task description is required.');
            return { success: false, exitCode: 1 };
        }""")
