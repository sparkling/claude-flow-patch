# WM-003: Activate AutoMemoryBridge in auto-memory-hook.mjs
# GitHub: #1102

# ── Op 1: Replace doImport() stub with full AutoMemoryBridge import ──
# The old code detects @claude-flow/memory but just prints "run init --upgrade".
# New code creates HybridBackend + AutoMemoryBridge and calls importFromAutoMemory().
# All ${...} must be \${...} in the JS template literal output,
# which means \\${...} in this Python source.

patch("WM-003a: doImport() — full AutoMemoryBridge import",
    HELPERS_GEN,
    """async function doImport() {
  // Try loading @claude-flow/memory for full functionality
  let memPkg = null;
  try { memPkg = await import('@claude-flow/memory'); } catch {}

  if (!memPkg || !memPkg.AutoMemoryBridge) {
    dim('Memory package not available — auto memory import skipped (non-critical)');
    return;
  }

  // Full implementation deferred to copied version
  dim('Auto memory import available — run init --upgrade for full support');
}""",
    """async function doImport() {
  let memPkg;
  try { memPkg = await import('@claude-flow/memory'); } catch (e) {
    dim('Memory package not available — auto memory import skipped (non-critical)');
    return;
  }
  const { HybridBackend, AutoMemoryBridge } = memPkg;
  if (!AutoMemoryBridge) {
    dim('AutoMemoryBridge not exported — auto memory import skipped');
    return;
  }
  let backend;
  try {
    backend = new HybridBackend({
      sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend();
    if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
    const bridge = new AutoMemoryBridge(backend, {
      workingDir: PROJECT_ROOT,
      syncMode: 'on-session-end',
      minConfidence: 0.7,
    });
    const result = await bridge.importFromAutoMemory();
    if (result.imported > 0) {
      dim(\\`Imported \\${result.imported} entries from auto memory (\\${result.durationMs}ms)\\`);
    }
  } catch (err) {
    dim(\\`Auto memory import error (non-critical): \\${err.message}\\`);
  } finally {
    if (backend) try { await backend.shutdown(); } catch {}
  }
}""")

# ── Op 2: Replace doSync() stub with full AutoMemoryBridge sync ──
patch("WM-003b: doSync() — full AutoMemoryBridge sync",
    HELPERS_GEN,
    """async function doSync() {
  if (!existsSync(STORE_PATH)) {
    dim('No entries to sync');
    return;
  }

  let memPkg = null;
  try { memPkg = await import('@claude-flow/memory'); } catch {}

  if (!memPkg || !memPkg.AutoMemoryBridge) {
    dim('Memory package not available — sync skipped (non-critical)');
    return;
  }

  dim('Auto memory sync available — run init --upgrade for full support');
}""",
    """async function doSync() {
  let memPkg;
  try { memPkg = await import('@claude-flow/memory'); } catch (e) {
    dim('Memory package not available — sync skipped (non-critical)');
    return;
  }
  const { HybridBackend, AutoMemoryBridge } = memPkg;
  if (!AutoMemoryBridge) {
    dim('AutoMemoryBridge not exported — sync skipped');
    return;
  }
  let backend;
  try {
    backend = new HybridBackend({
      sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend();
    if (sqlBe && sqlBe.db) sqlBe.db.pragma('busy_timeout = 5000');
    const bridge = new AutoMemoryBridge(backend, {
      workingDir: PROJECT_ROOT,
      syncMode: 'on-session-end',
      minConfidence: 0.7,
    });
    const result = await bridge.syncToAutoMemory();
    if (result.synced > 0) {
      dim(\\`Synced \\${result.synced} entries to auto memory (\\${result.durationMs}ms)\\`);
    } else {
      dim('No new entries to sync');
    }
  } catch (err) {
    dim(\\`Auto memory sync error (non-critical): \\${err.message}\\`);
  } finally {
    if (backend) try { await backend.shutdown(); } catch {}
  }
}""")

# ── Op 3: Replace doStatus() with real bridge status ──
patch("WM-003c: doStatus() — real bridge status",
    HELPERS_GEN,
    """function doStatus() {
  console.log('\\\\n=== Auto Memory Bridge Status ===\\\\n');
  console.log('  Package:        Fallback mode (run init --upgrade for full)');
  console.log(\\`  Store:          \\${existsSync(STORE_PATH) ? 'Initialized' : 'Not initialized'}\\`);
  console.log('');
}""",
    """async function doStatus() {
  console.log('\\\\n=== Auto Memory Bridge Status ===\\\\n');
  let pkgAvailable = false;
  let bridgeInfo = null;
  try {
    const memPkg = await import('@claude-flow/memory');
    pkgAvailable = !!memPkg.AutoMemoryBridge;
    if (pkgAvailable) {
      const { HybridBackend, AutoMemoryBridge } = memPkg;
      let backend;
      try {
        backend = new HybridBackend({
          sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
          agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
          dualWrite: true,
        });
        await backend.initialize();
        const count = await backend.count();
        bridgeInfo = { entries: count || 0 };
        await backend.shutdown();
      } catch (e) {
        if (backend) try { await backend.shutdown(); } catch {}
      }
    }
  } catch {}
  console.log(\\`  Package:        \\${pkgAvailable ? 'Active (AutoMemoryBridge)' : 'Not available'}\\`);
  console.log(\\`  Store:          \\${existsSync(STORE_PATH) ? 'Initialized' : 'Not initialized'}\\`);
  if (bridgeInfo) {
    console.log(\\`  Backend:        HybridBackend (\\${bridgeInfo.entries} entries)\\`);
  }
  const dbPath = join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db');
  console.log(\\`  Database:       \\${existsSync(dbPath) ? dbPath : 'Not created yet'}\\`);
  console.log('');
}""")
