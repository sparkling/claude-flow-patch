// Minimal fixture for HW-001, DM-006 testing
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
const opts = { stdio: ['pipe', 'pipe', 'pipe'] };
spawn('node', args, opts);

    ensureLogDir() {
        try {
            if (!existsSync(this.config.logDir)) {
                mkdirSync(this.config.logDir, { recursive: true });
            }
        }
        catch (error) {
            this.emit('warning', { message: 'Failed to create log directory', error });
        }
    }

    logExecution(executionId, type, content) {
        try {
            const timestamp = new Date().toISOString();
            const logFile = join(this.config.logDir, `${executionId}_${type}.log`);
            const logContent = `[${timestamp}] ${type.toUpperCase()}\n${'='.repeat(60)}\n${content}\n`;
            writeFileSync(logFile, logContent);
        }
        catch {
            // Ignore log write errors
        }
    }
