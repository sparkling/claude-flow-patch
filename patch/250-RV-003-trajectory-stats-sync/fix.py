# RV-003: trajectory-end does not update stats counters
# GitHub: #186 (ruv-FANN)

patch("RV-003a: sync stats counters before save in trajectory-end",
    ruvector_cli,
    """    if (!intel.data.trajectories) intel.data.trajectories = [];
    intel.data.trajectories.push(traj);
    delete trajectories[latestTrajId];
    intel.save();""",
    """    if (!intel.data.trajectories) intel.data.trajectories = [];
    intel.data.trajectories.push(traj);
    delete trajectories[latestTrajId];
    // RV-003: sync stats counters from actual data before saving
    if (!intel.data.stats) intel.data.stats = {};
    intel.data.stats.total_trajectories = intel.data.trajectories.length;
    intel.data.stats.total_patterns = Object.keys(intel.data.patterns || {}).length;
    intel.data.stats.total_memories = (intel.data.memories || []).length;
    intel.save();""")
