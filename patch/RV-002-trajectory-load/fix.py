# RV-002: activeTrajectories not loaded from saved file
# The load() method doesn't include activeTrajectories in the return object

RV_CLI = ruvector_cli

# Fix 1: Add activeTrajectories to defaults
patch("RV-002a: add activeTrajectories to defaults",
    RV_CLI,
    "stats: { total_patterns: 0, total_memories: 0, total_trajectories: 0, total_errors: 0, session_count: 0, last_session: 0 }\n    };",
    "stats: { total_patterns: 0, total_memories: 0, total_trajectories: 0, total_errors: 0, session_count: 0, last_session: 0 },\n      activeTrajectories: {}\n    };")

# Fix 2: Add activeTrajectories to loaded data return
patch("RV-002b: load activeTrajectories from file",
    RV_CLI,
    "// Preserve learning data if present\n          learning: data.learning || undefined",
    "// Preserve learning data if present\n          learning: data.learning || undefined,\n          // Preserve active trajectories for cross-command persistence\n          activeTrajectories: data.activeTrajectories || {}")
