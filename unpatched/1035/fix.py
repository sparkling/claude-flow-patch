# 1035: hive-mind task command calls non-existent MCP tool
# GitHub: #1035

HIVE_CMD = commands + "/hive-mind.js" if commands else ""

patch("1035a: hive-mind task uses task_create",
    HIVE_CMD,
    """const result = await callMCPTool('hive-mind_task', {
                description,
                priority,
                requireConsensus,
                timeout,
            });""",
    """const result = await callMCPTool('task_create', {
                type: 'hive-task',
                description,
                priority,
                tags: ['hive-mind']
            });""")

patch("1035b: hive-mind task output tolerates task_create response",
    HIVE_CMD,
    """`Assigned: ${result.assignedTo.join(', ')}`,
                `Consensus: ${result.requiresConsensus ? 'Yes' : 'No'}`,
                `Est. Time: ${result.estimatedTime}`""",
    """`Assigned: ${(result.assignedTo || []).join(', ') || 'unassigned'}`,
                `Consensus: ${requireConsensus ? 'Yes' : 'No'}`,
                `Est. Time: ${result.estimatedTime || `${timeout}s`}`""")
