# SG-003: Init missing helpers for --dual, --minimal, hooks, and upgrade paths
# GitHub: #1169
#
# Root cause:
# 1. init --dual bypasses executeInit() entirely — no .claude/helpers/ created
# 2. init --minimal and init hooks set components.helpers=false but settings=true
#    so settings.json references helpers that don't exist
# 3. executeUpgrade() only upgrades 3 of 8 helpers (missing router/session/memory)
# 4. helpers-generator.js generates hook-handler.cjs with require('router.js')
#    instead of require('router.cjs'), failing with "type":"module"
#
# 5 ops: dual path (init.js), settings guard (executor.js),
#         upgrade helpers (executor.js), generated requires (helpers-generator.js),
#         source-shipped hook-handler.cjs requires (SRC_HOOK_HANDLER)

# Op 1: init --dual should also generate Claude Code infrastructure
# After codex init succeeds, call executeInit() for helpers/settings/statusline
patch("SG-003a: --dual also generates helpers + settings via executeInit",
    INIT_CMD,
    """    // If codex mode, use the Codex initializer
    if (codexMode || dualMode) {
        return initCodexAction(ctx, { codexMode, dualMode, force, minimal, full });
    }""",
    """    // If codex mode, use the Codex initializer
    if (codexMode || dualMode) {
        const codexResult = await initCodexAction(ctx, { codexMode, dualMode, force, minimal, full });
        // SG-003: --dual must also create Claude Code infrastructure (.claude/helpers + settings)
        if (dualMode) {
            try {
                await executeInit({
                    ...DEFAULT_INIT_OPTIONS,
                    targetDir: cwd,
                    force,
                    components: {
                        settings: true,
                        helpers: true,
                        statusline: true,
                        skills: true,
                        commands: true,
                        agents: true,
                        mcp: true,
                        runtime: false,
                        claudeMd: false,
                    },
                });
            } catch { /* non-fatal — codex init already succeeded */ }
        }
        return codexResult;
    }""")

# Op 2: When settings is generated but helpers component is off, still generate
# the critical helpers that settings.json references
patch("SG-003b: generate critical helpers when settings references them",
    EXECUTOR,
    """        // Generate helpers
        if (options.components.helpers) {
            await writeHelpers(targetDir, options, result);
        }""",
    """        // Generate helpers
        if (options.components.helpers) {
            await writeHelpers(targetDir, options, result);
        }
        // SG-003: If settings will be generated but helpers were skipped,
        // generate the critical helpers that settings.json hooks reference
        else if (options.components.settings) {
            const hDir = path.join(targetDir, '.claude', 'helpers');
            fs.mkdirSync(hDir, { recursive: true });
            const criticalForSettings = {
                'hook-handler.cjs': generateHookHandler(),
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
            };
            for (const [name, content] of Object.entries(criticalForSettings)) {
                const fp = path.join(hDir, name);
                if (!fs.existsSync(fp)) {
                    fs.writeFileSync(fp, content, 'utf-8');
                    try { fs.chmodSync(fp, '755'); } catch {}
                    result.created.files.push(`.claude/helpers/${name}`);
                }
            }
        }""")

# Op 3: Expand executeUpgrade() critical helpers to include router/session/memory
# and add compat-copy sweep after statusline
patch("SG-003c: upgrade generates all helpers + compat sweep",
    EXECUTOR,
    """            const criticalHelpers = ['auto-memory-hook.mjs', 'hook-handler.cjs', 'intelligence.cjs'];""",
    """            const criticalHelpers = ['auto-memory-hook.mjs', 'hook-handler.cjs', 'intelligence.cjs', 'router.cjs', 'session.cjs', 'memory.cjs'];""")

# Op 4: Fix generated hook-handler.cjs to require .cjs instead of .js
# This is the fallback generator used when source helpers aren't found
patch_all("SG-003d: generated hook-handler requires .cjs not .js",
    HELPERS_GEN,
    """safeRequire(path.join(helpersDir, 'router.js'))""",
    """safeRequire(path.join(helpersDir, 'router.cjs'))""")

patch_all("SG-003e: generated hook-handler requires session.cjs",
    HELPERS_GEN,
    """safeRequire(path.join(helpersDir, 'session.js'))""",
    """safeRequire(path.join(helpersDir, 'session.cjs'))""")

patch_all("SG-003f: generated hook-handler requires memory.cjs",
    HELPERS_GEN,
    """safeRequire(path.join(helpersDir, 'memory.js'))""",
    """safeRequire(path.join(helpersDir, 'memory.cjs'))""")

# Op 5: Fix the source-shipped hook-handler.cjs (copied by writeHelpers when source found)
# This file is at <pkg-root>/.claude/helpers/hook-handler.cjs and gets copied as-is
patch_all("SG-003g: source hook-handler requires router.cjs",
    SRC_HOOK_HANDLER,
    """safeRequire(path.join(helpersDir, 'router.js'))""",
    """safeRequire(path.join(helpersDir, 'router.cjs'))""")

patch_all("SG-003h: source hook-handler requires session.cjs",
    SRC_HOOK_HANDLER,
    """safeRequire(path.join(helpersDir, 'session.js'))""",
    """safeRequire(path.join(helpersDir, 'session.cjs'))""")

patch_all("SG-003i: source hook-handler requires memory.cjs",
    SRC_HOOK_HANDLER,
    """safeRequire(path.join(helpersDir, 'memory.js'))""",
    """safeRequire(path.join(helpersDir, 'memory.cjs'))""")

# Op 6: Fix executeUpgrade() fallback — generatedCritical missing router/session/memory
# When source helpers aren't found, only 3 files were generated but hook-handler.cjs needs 6
# Also replaces generateIntelligenceStub() → intelligenceContent (set by IN-001a above)
patch("SG-003j: upgrade fallback generates router/session/memory",
    EXECUTOR,
    """            const generatedCritical = {
                'hook-handler.cjs': generateHookHandler(),
                'intelligence.cjs': generateIntelligenceStub(),
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
            };""",
    """            const generatedCritical = {
                'hook-handler.cjs': generateHookHandler(),
                'intelligence.cjs': intelligenceContent,
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
                // SG-003: hook-handler.cjs requires these — generate fallback versions
                'router.cjs': generateAgentRouter(),
                'session.cjs': generateSessionManager(),
                'memory.cjs': generateMemoryHelper(),
            };""")

# Transition: update caches that already have old SG-003a (skills: false) to new (skills: true)
# On fresh cache SG-003a applies directly; this skips (new already present).
# On pre-patched cache SG-003a warns (upstream old_string gone); this catches the delta.
patch("SG-003l: --dual enables skills/commands/agents (transition)",
    INIT_CMD,
    """                        skills: false,
                        commands: false,
                        agents: false,
                        mcp: true,
                        runtime: false,
                        claudeMd: false,
                    },
                });
            } catch { /* non-fatal — codex init already succeeded */ }""",
    """                        skills: true,
                        commands: true,
                        agents: true,
                        mcp: true,
                        runtime: false,
                        claudeMd: false,
                    },
                });
            } catch { /* non-fatal — codex init already succeeded */ }""")
