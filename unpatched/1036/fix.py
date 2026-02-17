# 1036: CLI uses non-existent MCP tools for task assignment/submit
# GitHub: #1036

TASK_CMD = commands + "/task.js" if commands else ""
HIVE_CMD = commands + "/hive-mind.js" if commands else ""

patch("1036a: task assign interactive uses task_update",
    TASK_CMD,
    """const result = await callMCPTool('task_assign', {
                        taskId,
                        agentIds: selectedAgents
                    });""",
    """const result = await callMCPTool('task_update', {
                        taskId,
                        assignTo: selectedAgents
                    });""")

patch("1036b: task assign non-interactive uses task_update",
    TASK_CMD,
    """const result = await callMCPTool('task_assign', {
                taskId,
                agentIds: unassign ? [] : agentIds.split(',').map(id => id.trim()),
                unassign
            });""",
    """const result = await callMCPTool('task_update', {
                taskId,
                assignTo: unassign ? [] : agentIds.split(',').map(id => id.trim())
            });""")

patch("1036c: hive-mind task uses task_create fallback",
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

patch("1036d: hive-mind task output tolerates fallback fields",
    HIVE_CMD,
    """`Assigned: ${result.assignedTo.join(', ')}`,
                `Consensus: ${result.requiresConsensus ? 'Yes' : 'No'}`,
                `Est. Time: ${result.estimatedTime}`""",
    """`Assigned: ${(result.assignedTo || []).join(', ') || 'unassigned'}`,
                `Consensus: ${requireConsensus ? 'Yes' : 'No'}`,
                `Est. Time: ${result.estimatedTime || `${timeout}s`}`""")
