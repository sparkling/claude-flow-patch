# 1047: statusline ADR count is hardcoded to 0/0
# GitHub: #1047

patch("1047a: add ADR status collector for hooks statusline",
    HOOKS_CMD,
    """            return { name, gitBranch, modelName };
        }
        // Collect all status""",
    """            return { name, gitBranch, modelName };
        }
        // Get ADR status
        function getADRStatus() {
            const adrDirs = [
                path.join(process.cwd(), 'docs', 'adr'),
                path.join(process.cwd(), 'docs', 'adrs'),
                path.join(process.cwd(), '.claude', 'docs', 'adr'),
                path.join(process.cwd(), '.claude', 'docs', 'adrs')
            ];
            let total = 0;
            let accepted = 0;
            const statusRegex = /(?:\\*\\*)?Status(?:\\*\\*)?\\s*:\\s*(Accepted|Implemented)/i;
            for (const adrDir of adrDirs) {
                if (!fs.existsSync(adrDir))
                    continue;
                try {
                    const stack = [adrDir];
                    while (stack.length > 0) {
                        const current = stack.pop();
                        if (!current)
                            continue;
                        const entries = fs.readdirSync(current, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullPath = path.join(current, entry.name);
                            if (entry.isDirectory()) {
                                stack.push(fullPath);
                                continue;
                            }
                            if (!entry.isFile())
                                continue;
                            if (!/adr[-_ ]?[0-9]+.*[.]md$/i.test(entry.name))
                                continue;
                            total += 1;
                            try {
                                const content = fs.readFileSync(fullPath, 'utf-8');
                                if (statusRegex.test(content))
                                    accepted += 1;
                            }
                            catch {
                                // Ignore
                            }
                        }
                    }
                }
                catch {
                    // Ignore
                }
            }
            return { accepted, total };
        }
        // Collect all status""")

patch("1047b: include ADR stats in statusData",
    HOOKS_CMD,
    """        const system = getSystemMetrics();
        const user = getUserInfo();
        const statusData = {
            user,
            v3Progress: progress,
            security,
            swarm,
            system,
            timestamp: new Date().toISOString()
        };""",
    """        const system = getSystemMetrics();
        const user = getUserInfo();
        const adr = getADRStatus();
        const statusData = {
            user,
            v3Progress: progress,
            security,
            swarm,
            system,
            adr,
            timestamp: new Date().toISOString()
        };""")

patch("1047c: render dynamic ADR statusline counts",
    HOOKS_CMD,
    "${c.cyan}ADRs${c.reset} ${c.dim}●0/0${c.reset}  ${c.dim}│${c.reset}  ",
    "${c.cyan}ADRs${c.reset} ${c.dim}●${adr.accepted}/${adr.total}${c.reset}  ${c.dim}│${c.reset}  ")
