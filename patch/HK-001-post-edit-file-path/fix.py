# HK-001: post-edit hook records file_path as "unknown"
# Claude Code passes tool input via stdin JSON, not TOOL_INPUT_* env vars.
# 3 ops: add stdin parsing, fix prompt fallback, fix post-edit file extraction.

patch("HK-001a: add stdin parsing",
    HELPERS_GEN,
    """'const [,, command, ...args] = process.argv;',
        "const prompt = process.env.PROMPT || process.env.TOOL_INPUT_command || args.join(' ') || '';",""",
    """'const [,, command, ...args] = process.argv;',
        '',
        '// Read stdin JSON from Claude Code hooks (provides tool_input, tool_name, etc.)',
        'let stdinData = {};',
        'try {',
        "  const raw = require(\\'fs\\').readFileSync(0, \\'utf-8\\').trim();",
        "  if (raw) stdinData = JSON.parse(raw);",
        '} catch (e) { /* stdin may be empty or non-JSON */ }',
        '',
        "const prompt = process.env.PROMPT || (stdinData.tool_input && stdinData.tool_input.command) || args.join(' ') || '';",""")

patch("HK-001b: post-edit read file_path from stdin",
    HELPERS_GEN,
    """"        var file = process.env.TOOL_INPUT_file_path || args[0] || '';",""",
    """"        var file = (stdinData.tool_input && stdinData.tool_input.file_path) || args[0] || '';",""")
