// Minimal fixture for NS-001, NS-002, WM-009

// WM-009b old_string: getMemoryFunctions
async function getMemoryFunctions() {
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
}

async function ensureInitialized() {
    // stub
}

// WM-009c old_string: memory_search result mapping and return
export const memoryTools = [
    {
        name: 'memory_search',
        handler: async (input) => {
            await ensureInitialized();
            const { searchEntries } = await getMemoryFunctions();
            const query = input.query;
            const namespace = input.namespace || 'all';
            const limit = input.limit || 10;
            const threshold = input.threshold || 0.3;
            const startTime = performance.now();
            try {
                const result = await searchEntries({
                    query,
                    namespace,
                    limit,
                    threshold,
                });
                const duration = performance.now() - startTime;
                // Parse JSON values in results
                const results = result.results.map(r => {
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
                };
            }
            catch (error) {
                return {
                    query,
                    results: [],
                    total: 0,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },
    {
        name: 'memory_retrieve',
        handler: async (input) => {
            await ensureInitialized();
            const { getEntry } = await getMemoryFunctions();
            const key = input.key;
            const namespace = input.namespace;
            if (!namespace || namespace === 'all') {
                throw new Error('Namespace is required (cannot be "all"). Use namespace: "patterns", "solutions", or "tasks"');
            }
            try {
                const result = await getEntry({ key, namespace });
                if (result.found && result.entry) {
                    return {
                        key,
                        namespace,
                        value: result.entry.content,
                        found: true,
                    };
                }
                return { key, namespace, value: null, found: false };
            }
            catch (error) {
                return { key, namespace, value: null, found: false,
                    error: error instanceof Error ? error.message : 'Unknown error' };
            }
        },
    },
];
