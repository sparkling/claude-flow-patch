# DM-006: No log rotation — headless execution logs grow unbounded
# GitHub: #1114

# A: Add unlinkSync and statSync to ESM import
patch("DM-006a: add unlinkSync/statSync to fs import",
    HWE,
    "import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';",
    "import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync, statSync } from 'fs';")

# B: Call cleanupOldLogs() from ensureLogDir()
patch("DM-006b: call cleanup from ensureLogDir",
    HWE,
    """    ensureLogDir() {
        try {
            if (!existsSync(this.config.logDir)) {
                mkdirSync(this.config.logDir, { recursive: true });
            }
        }
        catch (error) {
            this.emit('warning', { message: 'Failed to create log directory', error });
        }
    }""",
    """    ensureLogDir() {
        try {
            if (!existsSync(this.config.logDir)) {
                mkdirSync(this.config.logDir, { recursive: true });
            }
            this.cleanupOldLogs();
        }
        catch (error) {
            this.emit('warning', { message: 'Failed to create log directory', error });
        }
    }""")

# C: Add cleanupOldLogs() method before logExecution()
patch("DM-006c: add cleanupOldLogs method",
    HWE,
    """    logExecution(executionId, type, content) {""",
    """    cleanupOldLogs(maxAgeDays = 7, maxFiles = 500) {
        try {
            const files = readdirSync(this.config.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => {
                    try { return { name: f, mtime: statSync(join(this.config.logDir, f)).mtimeMs }; }
                    catch { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => b.mtime - a.mtime);
            const cutoff = Date.now() - maxAgeDays * 86400000;
            for (let i = 0; i < files.length; i++) {
                if (files[i].mtime < cutoff || i >= maxFiles) {
                    try { unlinkSync(join(this.config.logDir, files[i].name)); } catch {}
                }
            }
        }
        catch { /* ignore cleanup errors */ }
    }
    logExecution(executionId, type, content) {""")

# DM-006 extension: Main daemon.log rotation in daemon.js
# Before opening daemon.log for append, check size and rotate if > 50MB
patch("DM-006d: main daemon.log rotation",
    DJ,
    "    const logFile = join(logsDir, 'daemon.log');",
    """    const logFile = join(logsDir, 'daemon.log');
    // Rotate main daemon.log if > 50MB
    try {
        const logStat = fs.statSync(logFile);
        if (logStat.size > 50 * 1024 * 1024) {
            fs.renameSync(logFile, logFile + '.1');
        }
    } catch { /* file doesn't exist yet or stat failed — ignore */ }""")
