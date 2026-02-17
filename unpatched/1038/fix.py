# 1038: hooks list shows Enabled: No due to response shape mismatch
# GitHub: #1038

HOOKS_CMD = commands + "/hooks.js" if commands else ""

patch("1038a: normalize hook rows before list table render",
    HOOKS_CMD,
    """                data: result.hooks""",
    """                data: result.hooks.map((h) => ({
                    ...h,
                    enabled: (h.enabled ?? (h.status === 'active')),
                    executionCount: h.executionCount ?? 0,
                    lastExecuted: h.lastExecuted ?? null,
                    priority: h.priority ?? ''
                }))""")
