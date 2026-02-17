# @sentinel: grep "intelligenceContent" init/executor.js
# IN-001: intelligence.cjs generated as stub instead of full version
# GitHub: #1154
#
# When findSourceHelpersDir() fails (npx broken paths), the fallback calls
# generateIntelligenceStub() — a 197-line no-op. The full 916-line version
# ships in the package at .claude/helpers/intelligence.cjs.
#
# Fix: In both fallback paths, try reading the real file from the package
# root (via __dirname) before falling back to the stub.
# 2 ops: upgrade path (line ~398) + writeHelpers path (line ~943)

# Op 1: Upgrade path — when findSourceHelpersDir() returns null
patch("IN-001a: upgrade fallback reads real intelligence.cjs",
    EXECUTOR,
    """        else {
            // Source not found (npx with broken paths) — use generated fallbacks
            const generatedCritical = {
                'hook-handler.cjs': generateHookHandler(),
                'intelligence.cjs': generateIntelligenceStub(),
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
            };""",
    """        else {
            // Source not found (npx with broken paths) — use generated fallbacks
            // IN-001: Try reading real intelligence.cjs from package before using stub
            let intelligenceContent = generateIntelligenceStub();
            try {
                const realPath = path.resolve(__dirname, '..', '..', '..', '.claude', 'helpers', 'intelligence.cjs');
                if (fs.existsSync(realPath)) {
                    intelligenceContent = fs.readFileSync(realPath, 'utf-8');
                }
            } catch { /* use stub */ }
            const generatedCritical = {
                'hook-handler.cjs': generateHookHandler(),
                'intelligence.cjs': intelligenceContent,
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
            };""")

# Op 2: writeHelpers path — fresh init when source dir not found
patch("IN-001b: writeHelpers fallback reads real intelligence.cjs",
    EXECUTOR,
    """    // Fall back to generating helpers if source not available
    const helpers = {
        'pre-commit': generatePreCommitHook(),
        'post-commit': generatePostCommitHook(),
        'session.js': generateSessionManager(),
        'router.js': generateAgentRouter(),
        'memory.js': generateMemoryHelper(),
        'hook-handler.cjs': generateHookHandler(),
        'intelligence.cjs': generateIntelligenceStub(),
        'auto-memory-hook.mjs': generateAutoMemoryHook(),
    };""",
    """    // Fall back to generating helpers if source not available
    // IN-001: Try reading real intelligence.cjs from package before using stub
    let intelligenceForInit = generateIntelligenceStub();
    try {
        const realIntelPath = path.resolve(__dirname, '..', '..', '..', '.claude', 'helpers', 'intelligence.cjs');
        if (fs.existsSync(realIntelPath)) {
            intelligenceForInit = fs.readFileSync(realIntelPath, 'utf-8');
        }
    } catch { /* use stub */ }
    const helpers = {
        'pre-commit': generatePreCommitHook(),
        'post-commit': generatePostCommitHook(),
        'session.js': generateSessionManager(),
        'router.js': generateAgentRouter(),
        'memory.js': generateMemoryHelper(),
        'hook-handler.cjs': generateHookHandler(),
        'intelligence.cjs': intelligenceForInit,
        'auto-memory-hook.mjs': generateAutoMemoryHook(),
    };""")
