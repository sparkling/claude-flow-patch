// Minimal fixture for SG-003 testing
import { executeInit, DEFAULT_INIT_OPTIONS } from '../init/index.js';

const initAction = async (ctx) => {
    const codexMode = ctx.flags.codex;
    const dualMode = ctx.flags.dual;
    const cwd = ctx.cwd;
    // If codex mode, use the Codex initializer
    if (codexMode || dualMode) {
        return initCodexAction(ctx, { codexMode, dualMode, force, minimal, full });
    }
};
