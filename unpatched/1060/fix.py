# 1060: increase low default hook timeouts to reduce false timeout failures
# GitHub: #1060

TYPES = init + "/types.js" if init else ""

patch("1060a: init default hooks timeout 5000 -> 10000",
    TYPES,
    """        notification: true,
        timeout: 5000,
        continueOnError: true,""",
    """        notification: true,
        timeout: 10000,
        continueOnError: true,""")

patch("1060b: precompact session-end timeout 5000 -> 10000",
    SETTINGS_GEN,
    """                        command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs session-end',
                        timeout: 5000,""",
    """                        command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs session-end',
                        timeout: 10000,""")

patch("1060c: subagent stop post-task timeout 5000 -> 10000",
    SETTINGS_GEN,
    """                    command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-task',
                    timeout: 5000,""",
    """                    command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-task',
                    timeout: 10000,""")

patch("1060d: subagent stop teammate-idle timeout 5000 -> 10000",
    SETTINGS_GEN,
    """                    command: 'npx @claude-flow/cli@latest hooks teammate-idle',
                    timeout: 5000,""",
    """                    command: 'npx @claude-flow/cli@latest hooks teammate-idle',
                    timeout: 10000,""")

patch("1060e: upgrade TeammateIdle timeout 5000 -> 10000",
    EXECUTOR,
    """                        command: teammateIdleCmd,
                        timeout: 5000,
                        continueOnError: true,""",
    """                        command: teammateIdleCmd,
                        timeout: 10000,
                        continueOnError: true,""")

patch("1060f: upgrade TaskCompleted timeout 5000 -> 10000",
    EXECUTOR,
    """                        command: taskCompletedCmd,
                        timeout: 5000,
                        continueOnError: true,""",
    """                        command: taskCompletedCmd,
                        timeout: 10000,
                        continueOnError: true,""")
