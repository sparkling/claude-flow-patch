# SG-011: Fix stale --topology hierarchical references
# GitHub: #1206

# ── Op a: init.js --start-all exec command ──
patch("SG-011a: init --start-all topology hierarchical → hierarchical-mesh",
    INIT_CMD,
    """execSync('npx @claude-flow/cli@latest swarm init --topology hierarchical 2>/dev/null', {
                        stdio: 'pipe',
                        cwd: ctx.cwd,
                        timeout: 30000
                    });""",
    """execSync('npx @claude-flow/cli@latest swarm init --topology hierarchical-mesh 2>/dev/null', {
                        stdio: 'pipe',
                        cwd: ctx.cwd,
                        timeout: 30000
                    });""")

# ── Op b: claudemd-generator.js — anti-drift + auto-start templates ──
patch_all("SG-011b: claudemd topology hierarchical → hierarchical-mesh",
    CLAUDEMD_GEN,
    """--topology hierarchical --max-agents 8""",
    """--topology hierarchical-mesh --max-agents 8""")

# ── Op c: executor.js — CAPABILITIES.md quick commands ──
patch_all("SG-011c: CAPABILITIES.md topology hierarchical → hierarchical-mesh",
    EXECUTOR,
    """swarm init --topology hierarchical --max-agents 8""",
    """swarm init --topology hierarchical-mesh --max-agents 8""")
