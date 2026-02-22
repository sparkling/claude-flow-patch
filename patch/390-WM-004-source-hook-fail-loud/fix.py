# WM-004: Source hook silently falls back to JsonFileBackend
# GitHub: #1190

# ── Op 1: Replace readConfig() — read config.json instead of config.yaml ──
# Also adds createBackend() helper right after readConfig()
patch("WM-004a: readConfig + createBackend in source hook",
    SRC_AUTO_MEMORY_HOOK,
    """// ============================================================================
// Read config from .claude-flow/config.yaml
// ============================================================================

function readConfig() {
  const configPath = join(PROJECT_ROOT, '.claude-flow', 'config.yaml');
  const defaults = {
    learningBridge: { enabled: true, sonaMode: 'balanced', confidenceDecayRate: 0.005, accessBoostAmount: 0.03, consolidationThreshold: 10 },
    memoryGraph: { enabled: true, pageRankDamping: 0.85, maxNodes: 5000, similarityThreshold: 0.8 },
    agentScopes: { enabled: true, defaultScope: 'project' },
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const yaml = readFileSync(configPath, 'utf-8');
    // Simple YAML parser for the memory section
    const getBool = (key) => {
      const match = yaml.match(new RegExp(`${key}:\\\\s*(true|false)`, 'i'));
      return match ? match[1] === 'true' : undefined;
    };

    const lbEnabled = getBool('learningBridge[\\\\s\\\\S]*?enabled');
    if (lbEnabled !== undefined) defaults.learningBridge.enabled = lbEnabled;

    const mgEnabled = getBool('memoryGraph[\\\\s\\\\S]*?enabled');
    if (mgEnabled !== undefined) defaults.memoryGraph.enabled = mgEnabled;

    const asEnabled = getBool('agentScopes[\\\\s\\\\S]*?enabled');
    if (asEnabled !== undefined) defaults.agentScopes.enabled = asEnabled;

    return defaults;
  } catch {
    return defaults;
  }
}""",
    """// ============================================================================
// Read config from .claude-flow/config.json (YAML fallback for migration)
// ============================================================================

function readConfig() {
  const defaults = {
    backend: 'hybrid',
    learningBridge: { enabled: true, sonaMode: 'balanced', confidenceDecayRate: 0.005, accessBoostAmount: 0.03, consolidationThreshold: 10 },
    memoryGraph: { enabled: true, pageRankDamping: 0.85, maxNodes: 5000, similarityThreshold: 0.8 },
    agentScopes: { enabled: true, defaultScope: 'project' },
    syncMode: 'on-session-end',
    minConfidence: 0.7,
  };

  // Primary: read .claude-flow/config.json
  const jsonPath = join(PROJECT_ROOT, '.claude-flow', 'config.json');
  if (existsSync(jsonPath)) {
    try {
      const cfg = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const mem = cfg.memory || {};
      if (['hybrid', 'json', 'sqlite', 'agentdb'].includes(mem.backend)) defaults.backend = mem.backend;
      if (mem.learningBridge) Object.assign(defaults.learningBridge, mem.learningBridge);
      if (mem.memoryGraph) Object.assign(defaults.memoryGraph, mem.memoryGraph);
      if (mem.agentScopes) Object.assign(defaults.agentScopes, mem.agentScopes);
      if (mem.syncMode) defaults.syncMode = mem.syncMode;
      if (typeof mem.minConfidence === 'number') defaults.minConfidence = mem.minConfidence;
      return defaults;
    } catch (err) {
      dim(`[config:error] Failed to parse config.json: ${err.message}`);
    }
  }

  // Fallback: read config.yaml for backward compat
  const yamlPath = join(PROJECT_ROOT, '.claude-flow', 'config.yaml');
  if (existsSync(yamlPath)) {
    try {
      const yaml = readFileSync(yamlPath, 'utf-8');
      const getBool = (key) => {
        const match = yaml.match(new RegExp(`${key}:\\\\s*(true|false)`, 'i'));
        return match ? match[1] === 'true' : undefined;
      };
      const getStr = (key) => {
        const match = yaml.match(new RegExp(`${key}:\\\\s*([\\\\w-]+)`, 'i'));
        return match ? match[1] : undefined;
      };
      const parsedBackend = getStr('backend');
      if (parsedBackend && ['hybrid', 'json', 'sqlite', 'agentdb'].includes(parsedBackend)) defaults.backend = parsedBackend;
      const lbEnabled = getBool('learningBridge[\\\\s\\\\S]*?enabled');
      if (lbEnabled !== undefined) defaults.learningBridge.enabled = lbEnabled;
      const mgEnabled = getBool('memoryGraph[\\\\s\\\\S]*?enabled');
      if (mgEnabled !== undefined) defaults.memoryGraph.enabled = mgEnabled;
      const asEnabled = getBool('agentScopes[\\\\s\\\\S]*?enabled');
      if (asEnabled !== undefined) defaults.agentScopes.enabled = asEnabled;
      defaults.syncMode = getStr('syncMode') || defaults.syncMode;
      dim('[config] Read from config.yaml (legacy).');
      return defaults;
    } catch {
      return defaults;
    }
  }

  return defaults;
}

// WM-004: Backend factory (fail-loud when non-JSON backend is unavailable)
function createBackend(config, memPkg) {
  if (config.backend === 'json') {
    return { backend: new JsonFileBackend(STORE_PATH), isHybrid: false };
  }
  if (!memPkg.HybridBackend) {
    throw new Error(
      `Memory backend '${config.backend}' requires HybridBackend but it is not exported.\\n` +
      `Fix: Run 'npx @claude-flow/cli doctor --install'\\n` +
      `  Or: set "memory.backend": "json" in .claude-flow/config.json`
    );
  }
  const swarmDir = join(PROJECT_ROOT, '.swarm');
  if (!existsSync(swarmDir)) mkdirSync(swarmDir, { recursive: true });
  try {
    const backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(swarmDir, 'hybrid-memory.db') },
      agentdb: { dbPath: join(swarmDir, 'agentdb-memory.db') },
      dualWrite: config.backend === 'hybrid',
    });
    return { backend, isHybrid: true };
  } catch (err) {
    throw new Error(
      `HybridBackend failed to initialize: ${err.message}\\n` +
      `Fix: Run 'npx @claude-flow/cli doctor --install'\\n` +
      `  Or: set "memory.backend": "json" in .claude-flow/config.json`
    );
  }
}""")

# ── Op 2: Replace doImport() silent fallback with createBackend() ──
patch("WM-004b: doImport() uses createBackend()",
    SRC_AUTO_MEMORY_HOOK,
    """  const config = readConfig();
  let backend;
  try {
    if (!memPkg.HybridBackend) throw new Error('no HybridBackend');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend?.();
    if (sqlBe?.db) sqlBe.db.pragma('busy_timeout = 5000');
  } catch {
    backend = new JsonFileBackend(STORE_PATH);
    await backend.initialize();
  }

  const bridgeConfig = {
    workingDir: PROJECT_ROOT,
    syncMode: 'on-session-end',
  };""",
    """  const config = readConfig();
  const { backend, isHybrid } = createBackend(config, memPkg);
  await backend.initialize();

  const bridgeConfig = {
    workingDir: PROJECT_ROOT,
    syncMode: config.syncMode || 'on-session-end',
  };""")

# ── Op 3: Replace doSync() silent fallback with createBackend() ──
patch("WM-004c: doSync() uses createBackend()",
    SRC_AUTO_MEMORY_HOOK,
    """  const config = readConfig();
  let backend;
  try {
    if (!memPkg.HybridBackend) throw new Error('no HybridBackend');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(PROJECT_ROOT, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();
    const sqlBe = backend.getSQLiteBackend?.();
    if (sqlBe?.db) sqlBe.db.pragma('busy_timeout = 5000');
  } catch {
    backend = new JsonFileBackend(STORE_PATH);
    await backend.initialize();
  }

  const entryCount = await backend.count();""",
    """  const config = readConfig();
  const { backend, isHybrid } = createBackend(config, memPkg);
  await backend.initialize();

  const entryCount = await backend.count();""")
