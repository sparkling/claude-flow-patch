# SG-002: Settings generator outputs invalid permission patterns
# GitHub: #773

# Op 1: Fix @claude-flow permission pattern
patch("1: fix @claude-flow permission",
    SETTINGS_GEN,
    "'Bash(npx @claude-flow*)'",
    "'Bash(npx @claude-flow/cli:*)'")

# Op 2: Fix claude-flow permission pattern
patch("2: fix claude-flow permission",
    SETTINGS_GEN,
    "'Bash(npx claude-flow*)'",
    "'Bash(npx claude-flow:*)'")
