# SG-006: Wizard captures permissionRequest hook but never assigns it + topology hardcoded
# GitHub: #1184

# Op 1 (SG-006b): Add missing permissionRequest assignment after notification
patch("SG-006b: add permissionRequest hook assignment",
    INIT_CMD,
    """                    options.hooks.notification = hooks.includes('notification');
                }""",
    """                    options.hooks.notification = hooks.includes('notification');
                    options.hooks.permissionRequest = hooks.includes('permissionRequest');
                }""")

# Op 2 (SG-006c): Replace hardcoded --topology hierarchical with options.runtime.topology
# Use the wizard's inline-format execSync (3-level indent + single-line options) to
# uniquely match the wizard path, not the regular init path (2-level + multi-line).
patch("SG-006c: use selected topology in --start-all",
    INIT_CMD,
    """                        execSync('npx @claude-flow/cli@latest swarm init --topology hierarchical 2>/dev/null', {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
                        });""",
    """                        execSync(`npx @claude-flow/cli@latest swarm init --topology ${options.runtime.topology || 'hierarchical-mesh'} 2>/dev/null`, {
                            stdio: 'pipe', cwd: ctx.cwd, timeout: 30000
                        });""")
