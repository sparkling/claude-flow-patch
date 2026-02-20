# HK-005: Multiple MCP servers start independent in-process daemons
# No cross-process coordination on the hooks_session-start path.
# GitHub: #1171

# Op 1: Add PID-file guard before startDaemon()
patch("HK-005a: cross-process daemon PID guard",
    MCP_HOOKS,
    """        // Auto-start daemon if enabled
        let daemonStatus = { started: false };
        if (shouldStartDaemon) {
            try {
                // Dynamic import to avoid circular dependencies
                const { startDaemon } = await import('../services/worker-daemon.js');
                const daemon = await startDaemon(process.cwd());""",
    """        // Auto-start daemon if enabled
        let daemonStatus = { started: false };
        if (shouldStartDaemon) {
            try {
                // HK-005: PID-file guard — one daemon per project across processes
                const _pidDir = join(process.cwd(), '.claude-flow');
                const _pidPath = join(_pidDir, 'daemon.pid');
                let _skipDaemon = false;
                try {
                    const _xPid = parseInt(readFileSync(_pidPath, 'utf-8').trim(), 10);
                    if (!isNaN(_xPid) && _xPid !== process.pid) {
                        try { process.kill(_xPid, 0); _skipDaemon = true; daemonStatus = { started: true, pid: _xPid, reused: true }; }
                        catch { /* stale PID from dead process — proceed */ }
                    }
                } catch { /* no PID file — proceed */ }
                if (!_skipDaemon) {
                // Dynamic import to avoid circular dependencies
                const { startDaemon } = await import('../services/worker-daemon.js');
                const daemon = await startDaemon(process.cwd());""")

# Op 2: Write PID after successful start + close guard block
patch("HK-005b: write PID after daemon start",
    MCP_HOOKS,
    """                const status = daemon.getStatus();
                daemonStatus = {
                    started: true,
                    pid: status.pid,
                };""",
    """                const status = daemon.getStatus();
                // HK-005: Write PID so other processes detect this daemon
                try {
                    if (!existsSync(_pidDir)) { mkdirSync(_pidDir, { recursive: true }); }
                    writeFileSync(_pidPath, String(status.pid || process.pid));
                } catch { /* best-effort */ }
                daemonStatus = {
                    started: true,
                    pid: status.pid,
                };
                } // end HK-005 guard""")
