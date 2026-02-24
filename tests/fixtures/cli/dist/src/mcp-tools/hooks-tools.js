// Minimal fixture for HK-002, HK-003, HK-004, HK-005, NS-003, WM-007, WM-011
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
// =============================================================================
// Neural Module Lazy Loaders (SONA, EWC++, MoE, LoRA, Flash Attention)
// =============================================================================

        const shouldStartDaemon = params.startDaemon !== false;

        // Auto-start daemon if enabled
        let daemonStatus = { started: false };
        if (shouldStartDaemon) {
            try {
                // Dynamic import to avoid circular dependencies
                const { startDaemon } = await import('../services/worker-daemon.js');
                const daemon = await startDaemon(process.cwd());
                const status = daemon.getStatus();
                daemonStatus = {
                    started: true,
                    pid: status.pid,
                };

// WM-007e fixture: HK-004-patched form (old_string for WM-007e)
        })();
        // Auto-start daemon if enabled
        let daemonStatus = { started: false };

// WM-011 fixture: pattern store/search handlers (upstream form)
    handler: async (params) => {
        const pattern = params.pattern;
        const type = params.type || 'general';
        const confidence = params.confidence || 0.8;
        const metadata = params.metadata;
        const timestamp = new Date().toISOString();
        const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        // Try to persist using real store
        const storeFn = await getRealStoreFunction();
        let storeResult = { success: false };
        if (storeFn) {
            try {
                storeResult = await storeFn({
                    key: patternId,
                    value: JSON.stringify({
                        pattern,
                        type,
                        confidence,
                        metadata,
                        timestamp,
                    }),
                    namespace: 'patterns',
                    generateEmbeddingFlag: true, // Generate embedding for HNSW indexing
                    tags: [type, `confidence-${Math.round(confidence * 100)}`, 'reasoning-pattern'],
                });
            }
            catch (error) {
                storeResult = { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        return {
            patternId: storeResult.id || patternId,
            pattern,
            type,
            confidence,
            indexed: storeResult.success,
            hnswIndexed: storeResult.success && !!storeResult.embedding,
            embedding: storeResult.embedding,
            timestamp,
            implementation: storeResult.success ? 'real-hnsw-indexed' : 'memory-only',
            note: storeResult.success ? 'Pattern stored with vector embedding for semantic search' : (storeResult.error || 'Store function unavailable'),
        };
    },
};
export const hooksPatternSearch = {
    handler: async (params) => {
        const query = params.query;
        const topK = params.topK || 5;
        const minConfidence = params.minConfidence || 0.3;
        const namespace = params.namespace || 'patterns';
        // Try to use real vector search
        const searchFn = await getRealSearchFunction();
        if (searchFn) {
            try {
                const searchResult = await searchFn({
                    query,
                    namespace,
                    limit: topK,
                    threshold: minConfidence,
                });
                if (searchResult.success && searchResult.results.length > 0) {
                    return {
                        query,
                        results: searchResult.results.map(r => ({
                            patternId: r.id,
                            pattern: r.content,
                            similarity: r.score,
                            confidence: r.score, // Using similarity as confidence
                            namespace: r.namespace,
                            key: r.key,
                        })),
                        searchTimeMs: searchResult.searchTime,
                        backend: 'real-vector-search',
                        note: 'Results from actual HNSW/SQLite vector search',
                    };
                }
                // No results found
                return {
                    query,
                    results: [],
                    searchTimeMs: searchResult.searchTime,
                    backend: 'real-vector-search',
                    note: searchResult.error || 'No matching patterns found. Store patterns first using memory/store with namespace "patterns".',
                };
            }
            catch (error) {
                // Fall through to empty response with error
                return {
                    query,
                    results: [],
                    searchTimeMs: 0,
                    backend: 'error',
                    error: String(error),
                    note: 'Vector search failed. Ensure memory database is initialized.',
                };
            }
        }
        // No search function available
        return {
            query,
            results: [],
            searchTimeMs: 0,
            backend: 'unavailable',
            note: 'Real vector search not available. Initialize memory database with: claude-flow memory init',
        };
    },
};
// Intelligence stats hook
