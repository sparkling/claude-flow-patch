# HW-003: Worker scheduling intervals too aggressive
# GitHub: #1113
patch("3: audit 30m",
    WD,
    "type: 'audit', intervalMs: 10 * 60 * 1000",
    "type: 'audit', intervalMs: 30 * 60 * 1000")

patch("3: optimize 60m",
    WD,
    "type: 'optimize', intervalMs: 15 * 60 * 1000",
    "type: 'optimize', intervalMs: 60 * 60 * 1000")

patch("3: testgaps 60m",
    WD,
    "type: 'testgaps', intervalMs: 20 * 60 * 1000",
    "type: 'testgaps', intervalMs: 60 * 60 * 1000")

# HW-003 extension: Read daemon.schedules from .claude/settings.json
# and merge user-configured intervals into worker defaults
patch("3: settings-driven intervals",
    WD,
    "            workers: config?.workers ?? DEFAULT_WORKERS,",
    """            workers: (() => {
                const base = config?.workers ?? DEFAULT_WORKERS;
                try {
                    const sp = join(projectRoot, '.claude', 'settings.json');
                    const s = JSON.parse(readFileSync(sp, 'utf-8'));
                    const schedules = s?.claudeFlow?.daemon?.schedules;
                    if (!schedules || typeof schedules !== 'object') return base;
                    const parseInterval = (v) => {
                        if (typeof v === 'number') return v;
                        if (typeof v !== 'string') return null;
                        const m = v.match(/^(\\d+(?:\\.\\d+)?)\\s*(ms|s|m|h)$/i);
                        if (!m) return null;
                        const n = parseFloat(m[1]);
                        switch (m[2].toLowerCase()) {
                            case 'ms': return n;
                            case 's': return n * 1000;
                            case 'm': return n * 60 * 1000;
                            case 'h': return n * 3600 * 1000;
                            default: return null;
                        }
                    };
                    return base.map(w => {
                        const sched = schedules[w.type];
                        if (!sched) return w;
                        const iv = parseInterval(sched.interval ?? sched.intervalMs);
                        const en = typeof sched.enabled === 'boolean' ? sched.enabled : w.enabled;
                        return { ...w, ...(iv !== null ? { intervalMs: iv } : {}), enabled: en };
                    });
                } catch { return base; }
            })(),""")
