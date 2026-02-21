# WM-001: Wire @claude-flow/memory HybridBackend into CLI
# GitHub: #829
# 5 logical ops (a-e) in 2 patch() calls

# ── Patch 1: Module-level _hybridBackend + early-return branch in initializeMemoryDatabase() ──
# Inserts after the const destructuring, before the try block.
# Creates _hybridBackend, _createDefaultEntry, and rewires the function to use HybridBackend.

patch("WM-001a-e: HybridBackend early-return branch in initializeMemoryDatabase",
    MI,
    """export async function initializeMemoryDatabase(options) {
    const { backend = 'hybrid', dbPath: customPath, force = false, verbose = false, migrate = true } = options;
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    const dbDir = path.dirname(dbPath);
    try {""",
    """// WM-001: Module-level HybridBackend instance (set during initializeMemoryDatabase)
let _hybridBackend = null;
let _createDefaultEntry = null;

export async function initializeMemoryDatabase(options) {
    const { backend = 'hybrid', dbPath: customPath, force = false, verbose = false, migrate = true } = options;
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    const dbDir = path.dirname(dbPath);

    // WM-001a: Resolve backend choice (env > config.yaml > options > default)
    let backendChoice = backend;
    if (process.env.CLAUDE_FLOW_MEMORY_BACKEND) {
        backendChoice = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
    }
    if (backendChoice === 'hybrid') {
        try {
            const yamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
            if (fs.existsSync(yamlPath)) {
                const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
                const memSection = yamlContent.match(/^memory:\\s*\\n((?:[ \\t]*.*\\n)*?(?=^\\S|$))/m);
                if (memSection) {
                    const backendMatch = memSection[1].match(/^\\s+backend:\\s*(\\S+)/m);
                    if (backendMatch) backendChoice = backendMatch[1].replace(/^["']|["']$/g, '');
                }
            }
        } catch {}
    }
    backendChoice = ['hybrid','sqlite','sqljs','agentdb','memory'].includes(backendChoice)
        ? backendChoice : 'hybrid';

    // WM-001: Skip HybridBackend for sqljs or memory backends (use old sql.js path)
    if (backendChoice !== 'sqljs' && backendChoice !== 'memory') {
        try {
            // WM-001e: Pre-load embedding model for correct dimensions
            await loadEmbeddingModel();
            const modelDimensions = (embeddingModelState && embeddingModelState.dimensions) || 384;

            // Embedding wrapper: HybridBackend expects (text) => Promise<Float32Array>
            const embeddingGeneratorForHybrid = async (text) => {
                const result = await generateEmbedding(text);
                return new Float32Array(result.embedding);
            };

            // WM-001a: Import HybridBackend from @claude-flow/memory
            const memPkg = await import('@claude-flow/memory');
            const { HybridBackend, createDefaultEntry } = memPkg;
            _createDefaultEntry = createDefaultEntry;

            // Read HNSW config from embeddings.json
            let enableHNSW = true;
            try {
                const embConfigPath = path.join(process.cwd(), '.claude-flow', 'embeddings.json');
                if (fs.existsSync(embConfigPath)) {
                    const embConfig = JSON.parse(fs.readFileSync(embConfigPath, 'utf-8'));
                    if (embConfig.hnsw === false) enableHNSW = false;
                }
            } catch {}

            // WM-001c: Build HybridBackendConfig with correct keys
            const hybridDbPath = path.join(swarmDir, 'hybrid-memory.db');
            const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');
            const hybridConfig = {};
            if (backendChoice === 'hybrid' || backendChoice === 'sqlite') {
                hybridConfig.sqlite = { databasePath: hybridDbPath };
            }
            if (backendChoice === 'hybrid' || backendChoice === 'agentdb') {
                hybridConfig.agentdb = {
                    dbPath: agentDbPath,
                    vectorDimension: modelDimensions,
                    indexType: enableHNSW ? 'hnsw' : 'flat',
                };
            }
            hybridConfig.embeddingGenerator = embeddingGeneratorForHybrid;
            hybridConfig.dualWrite = backendChoice === 'hybrid';
            hybridConfig.defaultNamespace = 'default';
            hybridConfig.semanticThreshold = 0.7;

            // Create directory if needed
            if (!fs.existsSync(swarmDir)) {
                fs.mkdirSync(swarmDir, { recursive: true });
            }

            // WM-001a: Initialize HybridBackend
            const hybridBackend = new HybridBackend(hybridConfig);
            await hybridBackend.initialize();

            // WM-001d: Set busy_timeout on SQLiteBackend (AgentDB ALLOWED_PRAGMAS blocks it)
            try {
                const sqliteBackend = hybridBackend.getSQLiteBackend();
                if (sqliteBackend && sqliteBackend.db) {
                    sqliteBackend.db.pragma('busy_timeout = 5000');
                }
            } catch {}

            // WM-001: Shutdown handler for clean WAL flush
            const shutdownHybrid = async () => {
                try { await hybridBackend.shutdown(); } catch {}
            };
            process.on('beforeExit', shutdownHybrid);
            process.on('SIGTERM', () => { shutdownHybrid().then(() => process.exit(0)); });
            process.on('SIGINT', () => { shutdownHybrid().then(() => process.exit(0)); });

            // Set module-level reference for adapter functions
            _hybridBackend = hybridBackend;

            return {
                success: true,
                backend: backendChoice,
                dbPath: hybridDbPath,
                schemaVersion: '3.0.0',
                tablesCreated: ['hybrid-backend'],
                indexesCreated: enableHNSW ? ['hnsw-index'] : [],
                features: {
                    vectorEmbeddings: true,
                    patternLearning: true,
                    temporalDecay: true,
                    hnswIndexing: enableHNSW,
                    migrationTracking: true
                }
            };
        } catch (hybridError) {
            // Fail loud -- no silent fallback
            const msg = hybridError instanceof Error ? hybridError.message : String(hybridError);
            console.error(`[WM-001] ERROR: HybridBackend failed to initialize: ${msg}`);
            console.error('[WM-001] Run: npx @claude-flow/cli doctor --install');
            console.error('[WM-001] Or set backend: sqljs in .claude-flow/config.yaml');
            return {
                success: false,
                backend: backendChoice,
                dbPath,
                schemaVersion: '3.0.0',
                tablesCreated: [],
                indexesCreated: [],
                features: {
                    vectorEmbeddings: false,
                    patternLearning: false,
                    temporalDecay: false,
                    hnswIndexing: false,
                    migrationTracking: false
                },
                error: `HybridBackend unavailable: ${msg}. Run: npx @claude-flow/cli doctor --install -- or set backend: sqljs`
            };
        }
    }
    // Fall through to original sql.js path for 'sqljs' or 'memory' backends
    try {""")

# ── Patch 2: Adapter functions -- delegate to _hybridBackend when set ──
# Insert early-return delegation at the top of storeEntry.
# The old_string matches the NS-002-patched signature.

patch("WM-001b: storeEntry HybridBackend adapter",
    MI,
    """export async function storeEntry(options) {
    const { key, value, namespace, generateEmbeddingFlag = true, tags = [], ttl, dbPath: customPath, upsert = false } = options;
    if (!namespace || namespace === 'all') throw new Error('storeEntry: namespace is required (cannot be "all")');
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""",
    """export async function storeEntry(options) {
    const { key, value, namespace, generateEmbeddingFlag = true, tags = [], ttl, dbPath: customPath, upsert = false } = options;
    if (!namespace || namespace === 'all') throw new Error('storeEntry: namespace is required (cannot be "all")');
    // WM-001b: Delegate to HybridBackend when available
    if (_hybridBackend && _createDefaultEntry) {
        try {
            const ns = namespace === 'all' ? undefined : namespace;
            if (upsert) {
                const existing = await _hybridBackend.getByKey(ns, key);
                if (existing) {
                    existing.content = value;
                    existing.tags = tags || [];
                    existing.updatedAt = new Date().toISOString();
                    await _hybridBackend.update(existing.id, existing);
                    return { success: true, id: existing.id };
                }
            }
            const entry = _createDefaultEntry();
            entry.namespace = ns || 'default';
            entry.key = key;
            entry.content = value;
            entry.tags = tags || [];
            entry.metadata = {};
            entry.references = [];
            if (ttl) entry.expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
            await _hybridBackend.store(entry);
            return { success: true, id: entry.id };
        } catch (e) {
            return { success: false, id: '', error: e instanceof Error ? e.message : String(e) };
        }
    }
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""")

# ── Patch 3: searchEntries adapter ──
patch("WM-001b: searchEntries HybridBackend adapter",
    MI,
    """export async function searchEntries(options) {
    const { query, namespace = 'all', limit = 10, threshold = 0.3, dbPath: customPath } = options;
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    const startTime = Date.now();
    try {""",
    """export async function searchEntries(options) {
    const { query, namespace = 'all', limit = 10, threshold = 0.3, dbPath: customPath } = options;
    // WM-001b: Delegate to HybridBackend when available
    if (_hybridBackend) {
        const startTime = Date.now();
        try {
            const ns = namespace === 'all' ? undefined : namespace;
            // Try semantic search first
            let results = [];
            try {
                const semanticResults = await _hybridBackend.querySemantic({
                    content: query, namespace: ns, limit, threshold
                });
                results = (semanticResults || []).map(r => ({
                    id: (r.id || '').substring(0, 12),
                    key: r.key || (r.id || '').substring(0, 15),
                    content: (r.content || '').substring(0, 60) + ((r.content || '').length > 60 ? '...' : ''),
                    score: r.score || r.similarity || 0,
                    namespace: r.namespace || 'default'
                }));
            } catch {}
            // Keyword fallback if semantic returns nothing
            if (results.length === 0) {
                try {
                    const structured = await _hybridBackend.query({
                        namespace: ns, limit, type: 'structured'
                    });
                    const lowerQuery = query.toLowerCase();
                    const words = lowerQuery.split(/\\s+/);
                    results = (structured || [])
                        .filter(r => {
                            const c = (r.content || '').toLowerCase();
                            return words.some(w => c.includes(w));
                        })
                        .map(r => {
                            const c = (r.content || '').toLowerCase();
                            const matchCount = words.filter(w => c.includes(w)).length;
                            return {
                                id: (r.id || '').substring(0, 12),
                                key: r.key || (r.id || '').substring(0, 15),
                                content: (r.content || '').substring(0, 60) + ((r.content || '').length > 60 ? '...' : ''),
                                score: matchCount / words.length * 0.5,
                                namespace: r.namespace || 'default'
                            };
                        })
                        .filter(r => r.score >= threshold);
                } catch {}
            }
            results.sort((a, b) => b.score - a.score);
            return { success: true, results: results.slice(0, limit), searchTime: Date.now() - startTime };
        } catch (e) {
            return { success: false, results: [], searchTime: Date.now() - startTime,
                     error: e instanceof Error ? e.message : String(e) };
        }
    }
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    const startTime = Date.now();
    try {""")

# ── Patch 4: listEntries adapter ──
patch("WM-001b: listEntries HybridBackend adapter",
    MI,
    """export async function listEntries(options) {
    const { namespace, limit = 20, offset = 0, dbPath: customPath } = options;
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""",
    """export async function listEntries(options) {
    const { namespace, limit = 20, offset = 0, dbPath: customPath } = options;
    // WM-001b: Delegate to HybridBackend when available
    if (_hybridBackend) {
        try {
            const ns = namespace === 'all' ? undefined : namespace;
            // MUST pass type: 'structured' to force SQLite routing (offset works correctly)
            const entries = await _hybridBackend.query({
                namespace: ns, limit, offset, type: 'structured'
            });
            const count = await _hybridBackend.count(ns);
            return {
                success: true,
                entries: (entries || []).map(r => ({
                    id: (r.id || '').substring(0, 20),
                    key: r.key || (r.id || '').substring(0, 15),
                    namespace: r.namespace || 'default',
                    size: (r.content || '').length,
                    accessCount: r.accessCount || 0,
                    createdAt: r.createdAt || new Date().toISOString(),
                    updatedAt: r.updatedAt || new Date().toISOString(),
                    hasEmbedding: !!(r.embedding)
                })),
                total: count || 0
            };
        } catch (e) {
            return { success: false, entries: [], total: 0,
                     error: e instanceof Error ? e.message : String(e) };
        }
    }
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""")

# ── Patch 5: getEntry adapter ──
patch("WM-001b: getEntry HybridBackend adapter",
    MI,
    """export async function getEntry(options) {
    const { key, namespace, dbPath: customPath } = options;
    if (!namespace || namespace === 'all') throw new Error('getEntry: namespace is required (cannot be "all")');
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');""",
    """export async function getEntry(options) {
    const { key, namespace, dbPath: customPath } = options;
    if (!namespace || namespace === 'all') throw new Error('getEntry: namespace is required (cannot be "all")');
    // WM-001b: Delegate to HybridBackend when available
    if (_hybridBackend) {
        try {
            const entry = await _hybridBackend.getByKey(namespace, key);
            if (!entry) return { success: true, found: false };
            return {
                success: true,
                found: true,
                entry: {
                    id: String(entry.id),
                    key: entry.key || String(entry.id),
                    namespace: entry.namespace || 'default',
                    content: entry.content || '',
                    accessCount: (entry.accessCount || 0) + 1,
                    createdAt: entry.createdAt || new Date().toISOString(),
                    updatedAt: entry.updatedAt || new Date().toISOString(),
                    hasEmbedding: !!(entry.embedding),
                    tags: entry.tags || []
                }
            };
        } catch (e) {
            return { success: false, found: false,
                     error: e instanceof Error ? e.message : String(e) };
        }
    }
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');""")

# ── Patch 6: deleteEntry adapter ──
patch("WM-001b: deleteEntry HybridBackend adapter",
    MI,
    """export async function deleteEntry(options) {
    const { key, namespace, dbPath: customPath } = options;
    if (!namespace || namespace === 'all') throw new Error('deleteEntry: namespace is required (cannot be "all")');
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""",
    """export async function deleteEntry(options) {
    const { key, namespace, dbPath: customPath } = options;
    if (!namespace || namespace === 'all') throw new Error('deleteEntry: namespace is required (cannot be "all")');
    // WM-001b: Delegate to HybridBackend when available
    if (_hybridBackend) {
        try {
            const entry = await _hybridBackend.getByKey(namespace, key);
            if (!entry) {
                const count = await _hybridBackend.count(namespace);
                return { success: true, deleted: false, key, namespace,
                         remainingEntries: count || 0,
                         error: `Key '${key}' not found in namespace '${namespace}'` };
            }
            await _hybridBackend.delete(entry.id);
            const count = await _hybridBackend.count(namespace);
            return { success: true, deleted: true, key, namespace, remainingEntries: count || 0 };
        } catch (e) {
            return { success: false, deleted: false, key, namespace, remainingEntries: 0,
                     error: e instanceof Error ? e.message : String(e) };
        }
    }
    const swarmDir = path.join(process.cwd(), '.swarm');
    const dbPath = customPath || path.join(swarmDir, 'memory.db');
    try {""")
