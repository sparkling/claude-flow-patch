# WM-011: Instantiate ReasoningBank controller
# GitHub: #1210

# ── Op A: memory-initializer.js — instantiate ReasoningBank after HybridBackend init ──
# After _hybridBackend is set, import ReasoningBank from @claude-flow/neural
# and create an instance sharing the same RVF path.
# Targets the state AFTER WM-001 (execution order 350).
patch("WM-011a: instantiate ReasoningBank after HybridBackend init",
    MI,
    """            // Set module-level reference for adapter functions
            _hybridBackend = hybridBackend;

            return {
                success: true,
                backend: backendChoice,""",
    """            // Set module-level reference for adapter functions
            _hybridBackend = hybridBackend;

            // WM-011a: Instantiate ReasoningBank from @claude-flow/neural
            try {
                const neuralPkg = await import('@claude-flow/neural');
                const { ReasoningBank: RBClass } = neuralPkg;
                if (RBClass) {
                    const rbConfig = {
                        dbPath: agentDbPath,
                        vectorDimension: modelDimensions,
                        enableAgentDB: true,
                        namespace: 'reasoning-bank',
                    };
                    _reasoningBank = new RBClass(rbConfig);
                    await _reasoningBank.initialize();
                }
            } catch (_rbErr) {
                // ReasoningBank is optional — non-fatal if @claude-flow/neural unavailable
                _reasoningBank = null;
            }

            return {
                success: true,
                backend: backendChoice,""")

# ── Op A2: Add _reasoningBank module-level variable + getter export ──
# Insert _reasoningBank declaration alongside _hybridBackend (from WM-001)
patch("WM-011a2: add _reasoningBank module-level variable",
    MI,
    """// WM-001: Module-level HybridBackend instance (set during initializeMemoryDatabase)
let _hybridBackend = null;
let _createDefaultEntry = null;""",
    """// WM-001: Module-level HybridBackend instance (set during initializeMemoryDatabase)
let _hybridBackend = null;
let _createDefaultEntry = null;
// WM-011: Module-level ReasoningBank instance (set during initializeMemoryDatabase)
let _reasoningBank = null;""")

# ── Op A3: Export getReasoningBank getter ──
# Targets the state AFTER WM-009a has added recordSearchFeedback before export default.
# WM-009 is at order 570, WM-011 is at order 590.
patch("WM-011a3: export getReasoningBank getter",
    MI,
    """// WM-009a: Expose search feedback for self-learning loop
export async function recordSearchFeedback(entryId, quality) {""",
    """// WM-011a3: Expose ReasoningBank instance for hooks
export function getReasoningBank() {
    return _reasoningBank;
}
// WM-009a: Expose search feedback for self-learning loop
export async function recordSearchFeedback(entryId, quality) {""")

# ── Op B-cleanup: hooks-tools.js — remove stale WM-011b blocks from prior runs ──
# Older patch versions wrote different WM-011b blocks. If the file was patched
# by a prior run, there may be duplicate and/or old-format blocks that cause
# `let reasoningBankRef` to be declared multiple times (SyntaxError).
#
# The standard patch() idempotency check (new in code → skip) can't handle
# cleanup because the desired result is always a subset of the corrupt state.
# We use raw Python with re.sub to collapse duplicate blocks.
if MCP_HOOKS:
    try:
        with open(MCP_HOOKS, 'r') as _f:
            _hooks_code = _f.read()
        _dirty = False

        # Case 1: Remove old null-based WM-011b block (from pre-fix patch version)
        _old_null_block = """// WM-011b: ReasoningBank lazy loader
let reasoningBankRef = null;
async function getReasoningBankInstance() {
    if (reasoningBankRef === null) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            reasoningBankRef = undefined;
        }
    }
    return reasoningBankRef || null;
}
"""
        if _old_null_block in _hooks_code:
            _hooks_code = _hooks_code.replace(_old_null_block, "")
            _dirty = True
            print("  Applied: WM-011b-cleanup1: remove old null-based ReasoningBank lazy loader")

        # Case 2: Collapse duplicate new-format blocks (keep only the last one before header)
        _new_block = """// WM-011b: ReasoningBank lazy loader
// WM-011f (R7b): Retry when unavailable (don't permanently cache null)
let reasoningBankRef = undefined;
async function getReasoningBankInstance() {
    if (!reasoningBankRef) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            // Not available yet \u2014 will retry on next call
        }
    }
    return reasoningBankRef || null;
}
"""
        # Count occurrences; if more than 1, keep only one
        _count = _hooks_code.count(_new_block)
        if _count > 1:
            # Remove all but the last occurrence
            for _ in range(_count - 1):
                _hooks_code = _hooks_code.replace(_new_block, "", 1)
            _dirty = True
            print(f"  Applied: WM-011b-cleanup2: collapsed {_count} duplicate ReasoningBank blocks to 1")

        if _dirty:
            with open(MCP_HOOKS, 'w') as _f:
                _f.write(_hooks_code)
            applied += 1
    except FileNotFoundError:
        pass
    except Exception as _e:
        print(f"  ERROR: WM-011b-cleanup — {_e}")

# ── Op B: hooks-tools.js — add ReasoningBank lazy loader ──
# Insert after getRealStoreFunction and before Neural Module Lazy Loaders section.
# Writes the FINAL retry-on-null version directly (absorbs WM-011f for fresh installs).
patch("WM-011b: add ReasoningBank lazy loader to hooks-tools.js",
    MCP_HOOKS,
    """// =============================================================================
// Neural Module Lazy Loaders (SONA, EWC++, MoE, LoRA, Flash Attention)
// =============================================================================""",
    """// WM-011b: ReasoningBank lazy loader
// WM-011f (R7b): Retry when unavailable (don't permanently cache null)
let reasoningBankRef = undefined;
async function getReasoningBankInstance() {
    if (!reasoningBankRef) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            // Not available yet — will retry on next call
        }
    }
    return reasoningBankRef || null;
}
// =============================================================================
// Neural Module Lazy Loaders (SONA, EWC++, MoE, LoRA, Flash Attention)
// =============================================================================""")

# ── Op C: hooks-tools.js — replace hooksPatternStore handler ──
# Targets the upstream handler (unmodified by any prior patch).
patch("WM-011c: replace hooksPatternStore handler to use ReasoningBank",
    MCP_HOOKS,
    """    handler: async (params) => {
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
export const hooksPatternSearch = {""",
    """    handler: async (params) => {
        const pattern = params.pattern;
        const type = params.type || 'general';
        const confidence = params.confidence || 0.8;
        const metadata = params.metadata;
        const timestamp = new Date().toISOString();
        const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        // WM-011c: Try ReasoningBank first, then fall back to generic store
        const rb = await getReasoningBankInstance();
        if (rb) {
            try {
                // Create a minimal trajectory for distillation
                const trajectory = {
                    trajectoryId: patternId,
                    domain: type,
                    startTime: Date.now(),
                    isComplete: true,
                    qualityScore: confidence,
                    steps: [{
                        action: pattern,
                        stateAfter: new Float32Array(rb.config?.vectorDimension || 768),
                        reward: confidence,
                    }],
                };
                rb.storeTrajectory(trajectory);
                const memory = await rb.distill(trajectory);
                let rbPattern = null;
                if (memory) {
                    rbPattern = rb.memoryToPattern(memory);
                }
                return {
                    patternId: rbPattern?.patternId || patternId,
                    pattern,
                    type,
                    confidence,
                    indexed: true,
                    hnswIndexed: rb.isAgentDBAvailable(),
                    timestamp,
                    implementation: 'reasoning-bank',
                    note: 'Pattern stored via ReasoningBank with trajectory distillation',
                };
            } catch (_rbErr) {
                // Fall through to generic store
            }
        }
        // Fallback: generic store
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
                    generateEmbeddingFlag: true,
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
export const hooksPatternSearch = {""")

# ── Op D: hooks-tools.js — replace hooksPatternSearch handler ──
# Targets the upstream handler (unmodified by any prior patch).
patch("WM-011d: replace hooksPatternSearch handler to use ReasoningBank",
    MCP_HOOKS,
    """    handler: async (params) => {
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
// Intelligence stats hook""",
    """    handler: async (params) => {
        const query = params.query;
        const topK = params.topK || 5;
        const minConfidence = params.minConfidence || 0.3;
        const namespace = params.namespace || 'patterns';
        const startTime = Date.now();
        // WM-011d: Try ReasoningBank first for MMR-diverse retrieval
        const rb = await getReasoningBankInstance();
        if (rb) {
            try {
                const rbResults = await rb.retrieveByContent(query, topK);
                if (rbResults && rbResults.length > 0) {
                    return {
                        query,
                        results: rbResults
                            .filter(r => r.relevanceScore >= minConfidence)
                            .map(r => ({
                                patternId: r.memory.memoryId,
                                pattern: r.memory.strategy,
                                similarity: r.relevanceScore,
                                confidence: r.memory.quality,
                                namespace: 'reasoning-bank',
                                key: r.memory.trajectoryId,
                            })),
                        searchTimeMs: Date.now() - startTime,
                        backend: 'reasoning-bank',
                        note: 'Results from ReasoningBank MMR-diverse retrieval',
                    };
                }
            } catch (_rbErr) {
                // Fall through to generic search
            }
        }
        // Fallback: generic vector search
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
                            confidence: r.score,
                            namespace: r.namespace,
                            key: r.key,
                        })),
                        searchTimeMs: searchResult.searchTime,
                        backend: 'real-vector-search',
                        note: 'Results from actual HNSW/SQLite vector search',
                    };
                }
                return {
                    query,
                    results: [],
                    searchTimeMs: searchResult.searchTime,
                    backend: 'real-vector-search',
                    note: searchResult.error || 'No matching patterns found. Store patterns first using memory/store with namespace "patterns".',
                };
            }
            catch (error) {
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
// Intelligence stats hook""")

# ── Op E: hooks-tools.js — replace zero-vector with hash-based pseudo-embedding ──
# WM-011c writes a Float32Array of zeros for stateAfter; this replaces it with a
# deterministic hash-based vector derived from pattern + type + timestamp so that
# the HNSW index can distinguish entries.
patch("WM-011e: Hash-based pseudo-embedding instead of zero-vector (R7a)",
    MCP_HOOKS,
    """stateAfter: new Float32Array(rb.config?.vectorDimension || 768),""",
    """stateAfter: (() => { // WM-011e: hash-based pseudo-embedding
                        const { createHash } = require('node:crypto');
                        const dim = rb.config?.vectorDimension || 768;
                        const h = createHash('sha256').update(pattern + type + timestamp).digest();
                        const arr = new Float32Array(dim);
                        for (let i = 0; i < dim; i++) arr[i] = (h[i % h.length] - 128) / 128;
                        return arr; })(),""")

# ── Op F: hooks-tools.js — fix lazy-loader to retry when null (LEGACY UPGRADE) ──
# Handles already-patched installations where WM-011b previously wrote the old
# (non-retry) version. On fresh installs WM-011b now writes the retry version
# directly, so this op skips (idempotent).
patch("WM-011f: Retry-on-null ReasoningBank lazy loader (R7b)",
    MCP_HOOKS,
    """// WM-011b: ReasoningBank lazy loader
let reasoningBankRef = null;
async function getReasoningBankInstance() {
    if (reasoningBankRef === null) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            reasoningBankRef = undefined;
        }
    }
    return reasoningBankRef || null;
}""",
    """// WM-011b: ReasoningBank lazy loader
// WM-011f (R7b): Retry when unavailable (don't permanently cache null)
let reasoningBankRef = undefined;
async function getReasoningBankInstance() {
    if (!reasoningBankRef) {
        try {
            const { getReasoningBank } = await import('../memory/memory-initializer.js');
            reasoningBankRef = getReasoningBank() || undefined;
        } catch {
            // Not available yet — will retry on next call
        }
    }
    return reasoningBankRef || null;
}""")
