# DM-004: Worker stubs — preload + consolidation
# GitHub: #1139 (also covers #1140 DM-005 — merged)

# ── Op 1: Add missing workers to DEFAULT_WORKERS ──
patch("11: add missing workers to defaults",
    WD,
    "    { type: 'document', intervalMs: 60 * 60 * 1000, offsetMs: 0, priority: 'low', description: 'Auto-documentation', enabled: false },\n];",
    """    { type: 'document', intervalMs: 60 * 60 * 1000, offsetMs: 0, priority: 'low', description: 'Auto-documentation', enabled: false },
    { type: 'ultralearn', intervalMs: 0, offsetMs: 0, priority: 'normal', description: 'Deep knowledge acquisition (headless, manual trigger)', enabled: false },
    { type: 'deepdive', intervalMs: 4 * 60 * 60 * 1000, offsetMs: 0, priority: 'low', description: 'Deep code analysis', enabled: false },
    { type: 'refactor', intervalMs: 4 * 60 * 60 * 1000, offsetMs: 0, priority: 'low', description: 'Refactoring suggestions', enabled: false },
    { type: 'benchmark', intervalMs: 2 * 60 * 60 * 1000, offsetMs: 0, priority: 'low', description: 'Performance benchmarking', enabled: false },
    { type: 'preload', intervalMs: 10 * 60 * 1000, offsetMs: 0, priority: 'high', description: 'Embedding model + HNSW preload', enabled: true },
];""")

# ── Op 2: Real preload worker ──
patch("11: real preload worker",
    WD,
    """    async runPreloadWorkerLocal() {
        return {
            timestamp: new Date().toISOString(),
            mode: 'local',
            resourcesPreloaded: 0,
            cacheStatus: 'active',
        };
    }""",
    """    async runPreloadWorkerLocal() {
        const result = { timestamp: new Date().toISOString(), mode: 'local', resourcesPreloaded: 0, cacheStatus: 'active' };
        try {
            const mi = await import('../memory/memory-initializer.js');
            const modelResult = await mi.loadEmbeddingModel({ verbose: false });
            if (modelResult.success) { result.resourcesPreloaded++; result.embeddingModel = modelResult.modelName; }
            const hnswResult = await mi.getHNSWIndex();
            if (hnswResult) { result.resourcesPreloaded++; result.hnswEntries = hnswResult.entries?.size ?? 0; }
        } catch (e) { result.error = e?.message || String(e); }
        return result;
    }""")

# ── Op 3 (ex DM-005): Real consolidate worker ──
patch("12: real consolidate worker",
    WD,
    """    async runConsolidateWorker() {
        // Memory consolidation - clean up old patterns
        const consolidateFile = join(this.projectRoot, '.claude-flow', 'metrics', 'consolidation.json');
        const metricsDir = join(this.projectRoot, '.claude-flow', 'metrics');
        if (!existsSync(metricsDir)) {
            mkdirSync(metricsDir, { recursive: true });
        }
        const result = {
            timestamp: new Date().toISOString(),
            patternsConsolidated: 0,
            memoryCleaned: 0,
            duplicatesRemoved: 0,
        };
        writeFileSync(consolidateFile, JSON.stringify(result, null, 2));
        return result;
    }""",
    """    async runConsolidateWorker() {
        const consolidateFile = join(this.projectRoot, '.claude-flow', 'metrics', 'consolidation.json');
        const metricsDir = join(this.projectRoot, '.claude-flow', 'metrics');
        if (!existsSync(metricsDir)) {
            mkdirSync(metricsDir, { recursive: true });
        }
        const result = {
            timestamp: new Date().toISOString(),
            patternsConsolidated: 0,
            memoryCleaned: 0,
            duplicatesRemoved: 0,
        };
        try {
            const mi = await import('../memory/memory-initializer.js');
            // 1. Apply temporal decay (reduce confidence of stale patterns)
            const decayResult = await mi.applyTemporalDecay();
            if (decayResult?.success) result.patternsConsolidated = decayResult.patternsDecayed || 0;
            // 2. Rebuild HNSW index with current data
            mi.clearHNSWIndex();
            const hnsw = await mi.getHNSWIndex({ forceRebuild: true });
            if (hnsw) result.hnswRebuilt = hnsw.entries?.size ?? 0;
            result.memoryCleaned = 1;
        } catch (e) { result.error = e?.message || String(e); }
        writeFileSync(consolidateFile, JSON.stringify(result, null, 2));
        return result;
    }""")
