# HK-004: hooks_session-start ignores daemon.autoStart from settings.json
# GitHub: #1175
patch("HK-004: respect daemon autoStart setting",
    MCP_HOOKS,
    "        const shouldStartDaemon = params.startDaemon !== false;",
    """        const shouldStartDaemon = (() => {
            if (params.startDaemon === false) return false;
            try {
                const sp = join(process.cwd(), '.claude', 'settings.json');
                const s = JSON.parse(readFileSync(sp, 'utf-8'));
                if (s?.claudeFlow?.daemon?.autoStart === false) return false;
            } catch { /* no settings or unreadable — default to true */ }
            return true;
        })();""")
