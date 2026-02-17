# 1014: generated commands use internal package name instead of published package
# GitHub: #1014

INIT_CMD = commands + "/init.js" if commands else ""
MCP_GEN = init + "/mcp-generator.js" if init else ""
CLAUDEMD_GEN = init + "/claudemd-generator.js" if init else ""

patch_all("1014a: mcp generator uses published package in arg array",
    MCP_GEN,
    "@claude-flow/cli@latest",
    "claude-flow@latest")

patch_all("1014b: commands init uses published package name",
    INIT_CMD,
    "npx @claude-flow/cli@latest",
    "npx claude-flow@latest")

patch_all("1014c: settings generator uses published package name",
    SETTINGS_GEN,
    "npx @claude-flow/cli@latest",
    "npx claude-flow@latest")

patch_all("1014d: executor upgrade hooks use published package name",
    EXECUTOR,
    "npx @claude-flow/cli@latest",
    "npx claude-flow@latest")

patch_all("1014e: claudemd generator examples use published package name",
    CLAUDEMD_GEN,
    "npx @claude-flow/cli@latest",
    "npx claude-flow@latest")
