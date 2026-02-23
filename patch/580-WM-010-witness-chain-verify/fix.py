# WM-010: Wire witness chain verification at session start
# GitHub: #1208

# ── Op A: helpers-generator.js doImport() — add witness chain verify after init ──
# Targets the state AFTER WM-003a (doImport HybridBackend) has been applied.
# Unique context: "const sqlBe = backend.getSQLiteBackend();" only appears in doImport
# (doSync uses different code after initialize).
patch("WM-010a: helpers-generator doImport() witness chain verification",
    HELPERS_GEN,
    """    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend();
    if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
    const bridge = new AutoMemoryBridge(backend, {""",
    """    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend();
    if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
    // WM-010a: Verify witness chain integrity at session start
    try {
      if (typeof backend.verifyWitnessChain === 'function') {
        const wc = await backend.verifyWitnessChain();
        if (wc && !wc.valid) dim('WARNING: witness chain verification failed \\u2014 memory may be tampered');
      }
    } catch (e) { /* witness chain not available, skip */ }
    const bridge = new AutoMemoryBridge(backend, {""")

# ── Op B: auto-memory-hook.mjs doImport() — add witness chain verify after init ──
# Targets the state AFTER WM-004b (createBackend).
# Unique context: "await backend.initialize();\n\n  const bridgeConfig" only in doImport
# (doSync has "const entryCount" after initialize, not "const bridgeConfig").
patch("WM-010b: source hook doImport() witness chain verification",
    SRC_AUTO_MEMORY_HOOK,
    """  await backend.initialize();

  const bridgeConfig = {""",
    """  await backend.initialize();

  // WM-010b: Verify witness chain integrity at session start
  try {
    if (typeof backend.verifyWitnessChain === 'function') {
      const wc = await backend.verifyWitnessChain();
      if (wc && !wc.valid) dim('WARNING: witness chain verification failed \u2014 memory may be tampered');
    }
  } catch { /* witness chain not available, skip */ }

  const bridgeConfig = {""")
