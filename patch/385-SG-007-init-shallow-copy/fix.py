# SG-007: --skip-claude / --only-claude mutate shared init options via shallow copy
# GitHub: #1188
#
# Root cause: { ...DEFAULT_INIT_OPTIONS } only shallow-copies the top level.
# Nested objects (components, runtime, hooks, skills) remain shared refs.
# When --skip-claude / --only-claude mutate options.components.*, they permanently
# corrupt the original constant for all future invocations in the same process.
#
# Fix: Replace shallow spread with JSON.parse(JSON.stringify(...)) deep clone.
# 6 ops: 3 in initAction + 3 in wizard action.

# ── initAction spreads ──

patch("SG-007a: deep-clone MINIMAL_INIT_OPTIONS in initAction",
    INIT_CMD,
    """{ ...MINIMAL_INIT_OPTIONS, targetDir: cwd, force }""",
    """{ ...JSON.parse(JSON.stringify(MINIMAL_INIT_OPTIONS)), targetDir: cwd, force }""")

patch("SG-007b: deep-clone FULL_INIT_OPTIONS in initAction",
    INIT_CMD,
    """{ ...FULL_INIT_OPTIONS, targetDir: cwd, force }""",
    """{ ...JSON.parse(JSON.stringify(FULL_INIT_OPTIONS)), targetDir: cwd, force }""")

patch("SG-007c: deep-clone DEFAULT_INIT_OPTIONS in initAction",
    INIT_CMD,
    """{ ...DEFAULT_INIT_OPTIONS, targetDir: cwd, force }""",
    """{ ...JSON.parse(JSON.stringify(DEFAULT_INIT_OPTIONS)), targetDir: cwd, force }""")

# ── wizard action ──

patch("SG-007d: deep-clone DEFAULT_INIT_OPTIONS in wizard",
    INIT_CMD,
    """{ ...DEFAULT_INIT_OPTIONS, targetDir: ctx.cwd, force: ctx.flags.force }""",
    """{ ...JSON.parse(JSON.stringify(DEFAULT_INIT_OPTIONS)), targetDir: ctx.cwd, force: ctx.flags.force }""")

patch("SG-007e: deep-clone Object.assign MINIMAL_INIT_OPTIONS in wizard",
    INIT_CMD,
    """Object.assign(options, MINIMAL_INIT_OPTIONS)""",
    """Object.assign(options, JSON.parse(JSON.stringify(MINIMAL_INIT_OPTIONS)))""")

patch("SG-007f: deep-clone Object.assign FULL_INIT_OPTIONS in wizard",
    INIT_CMD,
    """Object.assign(options, FULL_INIT_OPTIONS)""",
    """Object.assign(options, JSON.parse(JSON.stringify(FULL_INIT_OPTIONS)))""")
