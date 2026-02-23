// Minimal fixture for HK-002, HK-003, HK-004, HK-005, NS-003, WM-007
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

        const shouldStartDaemon = params.startDaemon !== false;

        // Auto-start daemon if enabled
        let daemonStatus = { started: false };
        if (shouldStartDaemon) {
            try {
                // Dynamic import to avoid circular dependencies
                const { startDaemon } = await import('../services/worker-daemon.js');
                const daemon = await startDaemon(process.cwd());
                const status = daemon.getStatus();
                daemonStatus = {
                    started: true,
                    pid: status.pid,
                };

// WM-007e fixture: HK-004-patched form (old_string for WM-007e)
        })();
        // Auto-start daemon if enabled
        let daemonStatus = { started: false };
