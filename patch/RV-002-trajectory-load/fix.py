# @package: ruvector
# @sentinel: grep "activeTrajectories: data.activeTrajectories" bin/cli.js
# RV-002: activeTrajectories not loaded from saved file
# The load() method doesn't include activeTrajectories in the return object

# Fix 1: Add activeTrajectories to defaults
patch("RV-002a: add activeTrajectories to defaults",
    ruvector_cli,
    "stats: { total_patterns: 0, total_memories: 0, total_trajectories: 0, total_errors: 0, session_count: 0, last_session: 0 }\n    };",
    "stats: { total_patterns: 0, total_memories: 0, total_trajectories: 0, total_errors: 0, session_count: 0, last_session: 0 },\n      activeTrajectories: {}\n    };")

# Fix 2: Add activeTrajectories to loaded data return
patch("RV-002b: load activeTrajectories from file",
    ruvector_cli,
    "// Preserve learning data if present\n          learning: data.learning || undefined",
    "// Preserve learning data if present\n          learning: data.learning || undefined,\n          // Preserve active trajectories for cross-command persistence\n          activeTrajectories: data.activeTrajectories || {}")
