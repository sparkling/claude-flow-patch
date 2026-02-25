# WM-009: Wire AgentDB learning loop (recordFeedback)
# GitHub: #1209

# ── Op A: Export recordSearchFeedback from memory-initializer.js ──
# Adds a thin wrapper that delegates to _hybridBackend.recordFeedback()
# Targets the code just before `export default {` at end of file
patch("WM-009a: add recordSearchFeedback export to memory-initializer.js",
    MI,
    """export default {
    initializeMemoryDatabase,""",
    """// WM-009a: Expose search feedback for self-learning loop
export async function recordSearchFeedback(entryId, quality) {
    if (!_hybridBackend) return;
    if (typeof _hybridBackend.recordFeedback === 'function') {
        try { await _hybridBackend.recordFeedback(entryId, quality); } catch {}
    }
}
export default {
    initializeMemoryDatabase,""")

# ── Op B: Track search result entry IDs in memory-tools.js ──
# Adds a module-level Map and patches the import to include recordSearchFeedback.
patch("WM-009b: import recordSearchFeedback and add _recentSearchHits Map",
    MCP_MEMORY,
    """async function getMemoryFunctions() {
    const { storeEntry, searchEntries, listEntries, getEntry, deleteEntry, initializeMemoryDatabase, checkMemoryInitialization, } = await import('../memory/memory-initializer.js');
    return {
        storeEntry,
        searchEntries,
        listEntries,
        getEntry,
        deleteEntry,
        initializeMemoryDatabase,
        checkMemoryInitialization,
    };
}""",
    """// WM-009b: Track recent search hits for implicit feedback
const _recentSearchHits = new Map();
async function getMemoryFunctions() {
    const { storeEntry, searchEntries, listEntries, getEntry, deleteEntry, initializeMemoryDatabase, checkMemoryInitialization, recordSearchFeedback, } = await import('../memory/memory-initializer.js');
    return {
        storeEntry,
        searchEntries,
        listEntries,
        getEntry,
        deleteEntry,
        initializeMemoryDatabase,
        checkMemoryInitialization,
        recordSearchFeedback,
    };
}""")

# ── Op C: Populate _recentSearchHits after search returns results ──
# After results are mapped and before the return, record entry IDs in the Map.
# The raw result.results from searchEntries include .id fields from the backend.
patch("WM-009c: populate _recentSearchHits after memory_search",
    MCP_MEMORY,
    """                const results = result.results.map(r => {
                    let value = r.content;
                    try {
                        value = JSON.parse(r.content);
                    }
                    catch {
                        // Keep as string
                    }
                    return {
                        key: r.key,
                        namespace: r.namespace,
                        value,
                        similarity: r.score,
                    };
                });
                return {
                    query,
                    results,
                    total: results.length,
                    searchTime: `${duration.toFixed(2)}ms`,
                    backend: 'HNSW + sql.js',
                };""",
    """                const results = result.results.map(r => {
                    let value = r.content;
                    try {
                        value = JSON.parse(r.content);
                    }
                    catch {
                        // Keep as string
                    }
                    // WM-009c: Track entry ID for implicit feedback on later retrieve
                    if (r.id && r.key) {
                        const ns = r.namespace || 'default';
                        _recentSearchHits.set(`${ns}:${r.key}`, r.id);
                    }
                    return {
                        key: r.key,
                        namespace: r.namespace,
                        value,
                        similarity: r.score,
                    };
                });
                return {
                    query,
                    results,
                    total: results.length,
                    searchTime: `${duration.toFixed(2)}ms`,
                    backend: 'HNSW + sql.js',
                };""")

# ── Op D: Record implicit positive feedback on retrieve ──
# When memory_retrieve successfully finds an entry that was in recent search results,
# call recordSearchFeedback with quality 1.0 (positive implicit feedback).
patch("WM-009d: call recordSearchFeedback on retrieve of recent search hit",
    MCP_MEMORY,
    """        handler: async (input) => {
            await ensureInitialized();
            const { getEntry } = await getMemoryFunctions();
            const key = input.key;
            const namespace = input.namespace;
            if (!namespace || namespace === 'all') {
                throw new Error('Namespace is required (cannot be "all"). Use namespace: "patterns", "solutions", or "tasks"');
            }
            try {
                const result = await getEntry({ key, namespace });
                if (result.found && result.entry) {""",
    """        handler: async (input) => {
            await ensureInitialized();
            const { getEntry, recordSearchFeedback } = await getMemoryFunctions();
            const key = input.key;
            const namespace = input.namespace;
            if (!namespace || namespace === 'all') {
                throw new Error('Namespace is required (cannot be "all"). Use namespace: "patterns", "solutions", or "tasks"');
            }
            try {
                const result = await getEntry({ key, namespace });
                if (result.found && result.entry) {
                    // WM-009d: Implicit positive feedback — agent retrieved a search hit
                    const hitKey = `${namespace}:${key}`;
                    const trackedId = _recentSearchHits.get(hitKey);
                    if (trackedId && recordSearchFeedback) {
                        _recentSearchHits.delete(hitKey);
                        recordSearchFeedback(trackedId, 1.0).catch(() => {});
                    }""")

# ── Op E: Track trajectory ID (not entry ID) for learning feedback (R3) ──
# After WM-008q routes searches through the learning backend, results carry
# _trajectoryId. We need to store the trajectory ID instead of plain entry ID.
patch("WM-009e: Track trajectory ID (not entry ID) for learning feedback (R3)",
    MCP_MEMORY,
    """// WM-009c: Track entry ID for implicit feedback on later retrieve
                    if (r.id && r.key) {
                        const ns = r.namespace || 'default';
                        _recentSearchHits.set(`${ns}:${r.key}`, r.id);
                    }""",
    """// WM-009e (R3): Track trajectory ID for learning feedback (falls back to entry ID)
                    if (r.key) {
                        const ns = r.namespace || 'default';
                        const trackId = r._trajectoryId || r.id;
                        if (trackId) _recentSearchHits.set(`${ns}:${r.key}`, trackId);
                    }""")

# ── Op F: Cap _recentSearchHits at 500 entries (R6) ──
# Adds a max-size constant after the Map declaration.
patch("WM-009f: Cap _recentSearchHits at 500 entries (R6)",
    MCP_MEMORY,
    """const _recentSearchHits = new Map();""",
    """const _recentSearchHits = new Map();
const _SEARCH_HITS_MAX = 500;""")

# ── Op G: Evict oldest search hits when over cap (R6) ──
# Depends on WM-009e having applied (uses its output as old_string).
patch("WM-009g: Evict oldest search hits when over cap (R6)",
    MCP_MEMORY,
    """if (trackId) _recentSearchHits.set(`${ns}:${r.key}`, trackId);""",
    """if (trackId) {
                        _recentSearchHits.set(`${ns}:${r.key}`, trackId);
                        // WM-009g (R6): LRU eviction
                        if (_recentSearchHits.size > _SEARCH_HITS_MAX) {
                            const oldest = _recentSearchHits.keys().next().value;
                            _recentSearchHits.delete(oldest);
                        }
                    }""")
