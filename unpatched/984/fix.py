# 984: status shows STOPPED when task_summary tool is missing
# GitHub: #984

STATUS_CMD = commands + "/status.js" if commands else ""

patch("984a: status command fallback from task_summary to task_list",
    STATUS_CMD,
    """// Get task status
        const taskStatus = await callMCPTool('task_summary', {});""",
    """// Get task status
        let taskStatus = { total: 0, pending: 0, running: 0, completed: 0, failed: 0 };
        try {
            taskStatus = await callMCPTool('task_summary', {});
        }
        catch {
            try {
                const taskList = await callMCPTool('task_list', {});
                const tasks = taskList?.tasks || [];
                taskStatus = {
                    total: tasks.length,
                    pending: tasks.filter(t => t.status === 'pending').length,
                    running: tasks.filter(t => t.status === 'running' || t.status === 'in_progress').length,
                    completed: tasks.filter(t => t.status === 'completed').length,
                    failed: tasks.filter(t => t.status === 'failed').length
                };
            }
            catch {
                // Keep zeroed fallback; status should still report running services
            }
        }""")
