# @package: ruvector
# @sentinel: grep "Need engine for tick" bin/cli.js
# RV-001: force-learn calls intel.tick() which doesn't exist
# The tick() method is on the engine, not the Intelligence class

# Fix 1: Remove skipEngine: true so engine can initialize
patch("RV-001a: remove skipEngine from force-learn",
    ruvector_cli,
    "const intel = new Intelligence({ skipEngine: true });  // Fast mode\n    intel.tick();",
    "const intel = new Intelligence();  // Need engine for tick()\n    const eng = intel.engine;\n    if (eng) { eng.tick(); }")

# Fix 2: Update the success message to handle no-engine case
patch("RV-001b: handle no-engine case in force-learn",
    ruvector_cli,
    "if (eng) { eng.tick(); }\n    console.log(JSON.stringify({ success: true, result: 'Learning cycle triggered', stats: intel.stats() }));",
    "if (eng) { eng.tick(); }\n    console.log(JSON.stringify({ success: true, result: eng ? 'Learning cycle triggered' : 'Engine not available', stats: intel.stats() }));")
