# WM-008: Upgrade AgentDB v2 to v3 (RVF backend, self-learning, witness chain)
# GitHub: #1207

# ── Op A: DEFAULT_CONFIG vectorBackend 'auto' -> 'rvf' ──
patch("WM-008a: change default vectorBackend from 'auto' to 'rvf'",
    AGENTDB_BACKEND,
    """    vectorBackend: 'auto',""",
    """    vectorBackend: 'rvf',""")

# ── Op B: shutdown() — save unified .rvf before close + destroy learning backend ──
patch("WM-008b: save unified .rvf before close, destroy learning backend in shutdown",
    AGENTDB_BACKEND,
    """    async shutdown() {
        if (!this.initialized)
            return;
        if (this.agentdb) {
            await this.agentdb.close();
        }""",
    """    async shutdown() {
        if (!this.initialized)
            return;
        if (this.agentdb) {
            // WM-008b: Save unified .rvf file before closing (v3)
            if (this.agentdb.isUnifiedMode && typeof this.agentdb.save === 'function') {
                try { await this.agentdb.save(); } catch {}
            }
            // WM-008b: Destroy learning backend if active
            if (this.learningBackend) {
                try { await this.learningBackend.destroy(); } catch {}
                this.learningBackend = null;
            }
            await this.agentdb.close();
        }""")

# ── Op C: Import SelfLearningRvfBackend alongside AgentDB ──
patch("WM-008c: add SelfLearningRvfBackend variable declaration",
    AGENTDB_BACKEND,
    """let AgentDB;
let HNSWIndex;
let isHnswlibAvailable;""",
    """let AgentDB;
let HNSWIndex;
let isHnswlibAvailable;
let SelfLearningRvfBackend;""")

patch("WM-008c2: import SelfLearningRvfBackend in ensureAgentDBImport",
    AGENTDB_BACKEND,
    """                AgentDB = agentdbModule.AgentDB || agentdbModule.default;
                HNSWIndex = agentdbModule.HNSWIndex;
                isHnswlibAvailable = agentdbModule.isHnswlibAvailable;""",
    """                AgentDB = agentdbModule.AgentDB || agentdbModule.default;
                HNSWIndex = agentdbModule.HNSWIndex;
                isHnswlibAvailable = agentdbModule.isHnswlibAvailable;
                // WM-008c: Import SelfLearningRvfBackend (v3-only, undefined on v2)
                SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;""")

# ── Op D: After initialize, create learning backend + capture witness chain hash ──
patch("WM-008d: create learning backend and capture witness chain in initialize",
    AGENTDB_BACKEND,
    """            this.initialized = true;
            this.emit('initialized', {
                backend: this.agentdb.vectorBackendName,
                isWasm: this.agentdb.isWasm,
            });""",
    """            this.initialized = true;
            // WM-008d: Create self-learning backend when enabled (v3-only)
            if (this.config.enableLearning && SelfLearningRvfBackend) {
                try {
                    this.learningBackend = await SelfLearningRvfBackend.create({
                        dimension: this.config.vectorDimension || 1536,
                        metric: 'cosine',
                        storagePath: this.config.dbPath || ':memory:',
                        learning: true,
                        positiveThreshold: this.config.learningPositiveThreshold ?? 0.7,
                        negativeThreshold: this.config.learningNegativeThreshold ?? 0.3,
                        trainingBatchSize: this.config.learningBatchSize ?? 32,
                        tickIntervalMs: this.config.learningTickInterval ?? 30000,
                    });
                } catch (learnErr) {
                    // Non-fatal: self-learning is an optional enhancement
                }
            }
            // WM-008f: Capture witness chain hash at init (v3-only)
            let witnessChainHash;
            if (this.agentdb && typeof this.agentdb.getWitnessChain === 'function') {
                try {
                    const chain = this.agentdb.getWitnessChain();
                    witnessChainHash = chain?.currentHash;
                } catch {}
            }
            this.emit('initialized', {
                backend: this.agentdb.vectorBackendName,
                isWasm: this.agentdb.isWasm,
                learning: !!this.learningBackend,
                unifiedMode: !!this.agentdb.isUnifiedMode,
                witnessChainHash,
            });""")

# ── Op E+F: Add recordFeedback, getWitnessChain, verifyWitnessChain methods ──
patch("WM-008ef: add recordFeedback + witness chain methods",
    AGENTDB_BACKEND,
    """    getAgentDB() {
        return this.agentdb;
    }
}""",
    """    getAgentDB() {
        return this.agentdb;
    }
    /**
     * WM-008e: Record search feedback for self-learning (v3-only)
     */
    async recordFeedback(queryId, quality) {
        if (!this.learningBackend || typeof this.learningBackend.recordFeedback !== 'function') return;
        try {
            await this.learningBackend.recordFeedback(queryId, quality);
        } catch {}
    }
    /**
     * WM-008f: Get witness chain for tamper detection (v3-only)
     */
    getWitnessChain() {
        if (!this.agentdb) return null;
        if (typeof this.agentdb.getWitnessChain === 'function') {
            try { return this.agentdb.getWitnessChain(); } catch { return null; }
        }
        return null;
    }
    /**
     * WM-008f: Verify witness chain integrity (v3-only)
     */
    async verifyWitnessChain() {
        if (!this.agentdb) return { valid: false, reason: 'agentdb not initialized' };
        if (typeof this.agentdb.verifyWitnessChain === 'function') {
            try { return await this.agentdb.verifyWitnessChain(); } catch (e) { return { valid: false, reason: String(e) }; }
        }
        return { valid: false, reason: 'witness chain not available (requires agentdb v3)' };
    }
}""")

# ── Op G: memory-initializer.js — .db -> .rvf + vectorBackend + learning config ──
# Targets the state AFTER WM-007a2 has been applied (execution order 530 < 560)
patch("WM-008g1: change agentdb path from .db to .rvf",
    MI,
    """            const agentDbPath = path.join(swarmDir, 'agentdb-memory.db');""",
    """            const agentDbPath = path.join(swarmDir, 'agentdb-memory.rvf');""")

patch("WM-008g2: replace v2 agentdb config with v3 RVF + learning config",
    MI,
    """            if (backendChoice === 'hybrid' || backendChoice === 'agentdb') {
                hybridConfig.agentdb = {
                    dbPath: agentDbPath,
                    vectorDimension: modelDimensions,
                    indexType: enableHNSW ? 'hnsw' : 'flat',
                };
            }""",
    """            if (backendChoice === 'hybrid' || backendChoice === 'agentdb') {
                // WM-008g: AgentDB v3 config with RVF backend + self-learning
                const agentdbCfg = cfgMemory.agentdb || {};
                hybridConfig.agentdb = {
                    dbPath: agentDbPath,
                    vectorDimension: modelDimensions,
                    vectorBackend: 'rvf',
                    enableLearning: agentdbCfg.enableLearning !== false,
                    learningPositiveThreshold: agentdbCfg.learningPositiveThreshold ?? 0.7,
                    learningNegativeThreshold: agentdbCfg.learningNegativeThreshold ?? 0.3,
                    learningBatchSize: agentdbCfg.learningBatchSize ?? 32,
                    learningTickInterval: agentdbCfg.learningTickInterval ?? 30000,
                };
            }""")

# ── Op H: executor.js — add agentdb subsection to config.json template ──
# Targets the state AFTER SG-010c has been applied (execution order 540 < 560)
patch("WM-008h: add agentdb v3 config subsection to config.json template",
    EXECUTOR,
    """            agentScopes: {
                enabled: !!(options.runtime.enableAgentScopes ?? true),
                defaultScope: options.runtime.defaultScope || 'project',
            },
        },
        neural: {""",
    """            agentScopes: {
                enabled: !!(options.runtime.enableAgentScopes ?? true),
                defaultScope: options.runtime.defaultScope || 'project',
            },
            // WM-008h: AgentDB v3 self-learning config
            agentdb: {
                vectorBackend: 'rvf',
                enableLearning: !!(options.runtime.enableAgentdbLearning ?? true),
                learningPositiveThreshold: options.runtime.agentdbPositiveThreshold ?? 0.7,
                learningNegativeThreshold: options.runtime.agentdbNegativeThreshold ?? 0.3,
                learningBatchSize: options.runtime.agentdbBatchSize ?? 32,
                learningTickInterval: options.runtime.agentdbTickInterval ?? 30000,
            },
        },
        neural: {""")

# ── Op I: @claude-flow/memory package.json — update agentdb dep version ──
patch("WM-008i: update @claude-flow/memory agentdb dep from v2 to v3",
    MEMORY_PKG_JSON,
    """    "agentdb": "2.0.0-alpha.3.7",""",
    """    "agentdb": "3.0.0-alpha.3",""")

# ── Op J: agentdb-backend.js header comment — update version ref ──
patch("WM-008j: update agentdb-backend.js header comment to v3",
    AGENTDB_BACKEND,
    """ * AgentDB Backend - Integration with agentdb@2.0.0-alpha.3.4""",
    """ * AgentDB Backend - Integration with agentdb@3.0.0-alpha.3""")

# ── Op K: helpers-generator.js — .db -> .rvf + v3 config (3 HybridBackend blocks) ──
# All 3 blocks have identical agentdb config; patch_all replaces them all at once
patch_all("WM-008k: helpers-generator.js agentdb-memory.db -> .rvf + v3 config",
    HELPERS_GEN,
    """      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.db') },""",
    """      agentdb: { dbPath: join(PROJECT_ROOT, '.swarm', 'agentdb-memory.rvf'), vectorBackend: 'rvf' },""")

# ── Op L: auto-memory-hook.mjs (source helper) — .db -> .rvf + v3 config ──
# createBackend() uses swarmDir variable; patch_all covers any remaining PROJECT_ROOT variants
patch("WM-008l: auto-memory-hook.mjs createBackend agentdb-memory.db -> .rvf",
    SRC_AUTO_MEMORY_HOOK,
    """      agentdb: { dbPath: join(swarmDir, 'agentdb-memory.db') },""",
    """      agentdb: { dbPath: join(swarmDir, 'agentdb-memory.rvf'), vectorBackend: 'rvf', enableLearning: config.agentdb?.enableLearning !== false },""")

patch_all("WM-008l2: auto-memory-hook.mjs remaining agentdb-memory.db -> .rvf",
    SRC_AUTO_MEMORY_HOOK,
    """agentdb-memory.db""",
    """agentdb-memory.rvf""")

# ── Op M: @claude-flow/neural reasoning-bank.js — vectorBackend 'auto' -> 'rvf' ──
patch("WM-008m: reasoning-bank.js vectorBackend auto -> rvf",
    NEURAL_REASONING_BANK,
    """                        vectorBackend: 'auto',""",
    """                        vectorBackend: 'rvf',""")

# ── Op N: @claude-flow/shared defaults.js — replace v2 indexType with v3 vectorBackend ──
patch("WM-008n: shared defaults.js add vectorBackend rvf to agentdb defaults",
    SHARED_DEFAULTS,
    """    agentdb: {
        dimensions: 1536,
        indexType: 'hnsw',
        efConstruction: 200,
        m: 16,
        quantization: 'none',
    },""",
    """    agentdb: {
        dimensions: 1536,
        vectorBackend: 'rvf',
        indexType: 'hnsw',
        efConstruction: 200,
        m: 16,
        quantization: 'none',
    },""")

# ── Op O: executor.js — update version table from v2 to v3 ──
patch("WM-008o: executor.js version table agentdb 2.x -> 3.x",
    EXECUTOR,
    """| agentdb | 2.0.0-alpha.3.4 | Vector database |""",
    """| agentdb | 3.0.0-alpha.3 | Vector database (RVF + self-learning) |""")

# ── Op P (R1): Fix SelfLearningRvfBackend import via sub-path ──
patch("WM-008p: fallback to agentdb/backends/self-learning sub-path import (R1)",
    AGENTDB_BACKEND,
    """                // WM-008c: Import SelfLearningRvfBackend (v3-only, undefined on v2)
                SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;""",
    """                // WM-008c: Import SelfLearningRvfBackend (v3-only, undefined on v2)
                SelfLearningRvfBackend = agentdbModule.SelfLearningRvfBackend;
                // WM-008p (R1): Fallback to sub-path import (not in main exports)
                if (!SelfLearningRvfBackend) {
                    try {
                        const slrMod = await import('agentdb/backends/self-learning');
                        SelfLearningRvfBackend = slrMod.SelfLearningRvfBackend || slrMod.default;
                    } catch (_slrErr) { /* agentdb v2 or sub-path unavailable */ }
                }""")

# ── Op Q (R8): Route search through SelfLearningRvfBackend for trajectory tracking ──
patch("WM-008q: route search through learning backend for trajectory tracking (R8)",
    AGENTDB_BACKEND,
    """    async search(embedding, options) {
        const startTime = performance.now();
        if (!this.agentdb) {
            // Fallback to brute-force search
            return this.bruteForceSearch(embedding, options);
        }""",
    """    async search(embedding, options) {
        const startTime = performance.now();
        if (!this.agentdb) {
            // Fallback to brute-force search
            return this.bruteForceSearch(embedding, options);
        }
        // WM-008q (R8): Route through learning backend if available
        if (this.learningBackend) {
            try {
                const k = (options && options.k) || 10;
                const lbResults = await this.learningBackend.searchAsync(embedding, k, options);
                if (lbResults && lbResults.length > 0) {
                    // Extract trajectory ID from learning backend's internal counter
                    const trajId = lbResults._queryId || null;
                    return lbResults.map(r => ({
                        entry: { id: r.id, content: r.metadata?.content, namespace: r.metadata?.namespace,
                                 key: r.metadata?.key, tags: r.metadata?.tags || [], type: r.metadata?.type,
                                 embedding: null, createdAt: r.metadata?.createdAt, updatedAt: r.metadata?.updatedAt },
                        score: r.similarity ?? (1 - (r.distance ?? 0)),
                        _trajectoryId: trajId,
                    }));
                }
            } catch (_lbErr) { /* Fall through to plain search */ }
        }""")

# ── Op R (R9): Fix verifyWitnessChain to use vectorBackend.verifyWitness() ──
patch("WM-008r: fix verifyWitnessChain to use vectorBackend.verifyWitness (R9)",
    AGENTDB_BACKEND,
    """    async verifyWitnessChain() {
        if (!this.agentdb) return { valid: false, reason: 'agentdb not initialized' };
        if (typeof this.agentdb.verifyWitnessChain === 'function') {
            try { return await this.agentdb.verifyWitnessChain(); } catch (e) { return { valid: false, reason: String(e) }; }
        }
        return { valid: false, reason: 'witness chain not available (requires agentdb v3)' };
    }""",
    """    async verifyWitnessChain() {
        if (!this.agentdb) return { valid: false, reason: 'agentdb not initialized' };
        // WM-008r (R9): Use vectorBackend.verifyWitness() for data mutation chain
        const vb = this.agentdb.vectorBackend;
        if (vb && typeof vb.verifyWitness === 'function') {
            try {
                const result = vb.verifyWitness();
                return { valid: !!result?.valid, entries: result?.entries || 0, chain: 'data', reason: result?.valid ? 'intact' : (result?.error || 'broken') };
            } catch (e) { return { valid: false, reason: String(e), chain: 'data' }; }
        }
        // Fallback: try learning backend's chain (tracks learning mutations)
        if (this.learningBackend && typeof this.learningBackend.verifyWitnessChain === 'function') {
            try {
                const lr = this.learningBackend.verifyWitnessChain();
                return { valid: !!lr?.valid, entries: lr?.entryCount || 0, chain: 'learning', reason: lr?.valid ? 'intact' : 'broken' };
            } catch (e) { return { valid: false, reason: String(e), chain: 'learning' }; }
        }
        return { valid: true, reason: 'no witness chain available', chain: 'none' };
    }""")

# ── Op S (R5): Add tick + clear interval in shutdown path ──
patch("WM-008s: run final tick and clear interval before shutdown (R5)",
    AGENTDB_BACKEND,
    """            // WM-008b: Destroy learning backend if active
            if (this.learningBackend) {
                try { await this.learningBackend.destroy(); } catch {}
                this.learningBackend = null;
            }""",
    """            // WM-008s (R5): Run final tick before shutdown
            if (this.learningBackend) {
                try { await this.learningBackend.tick(); } catch {}
            }
            // WM-008s (R5): Clear tick interval
            if (this._tickInterval) {
                clearInterval(this._tickInterval);
                this._tickInterval = null;
            }
            // WM-008b: Destroy learning backend if active
            if (this.learningBackend) {
                try { await this.learningBackend.destroy(); } catch {}
                this.learningBackend = null;
            }""")

# ── Op S2 (R5): Start tick interval after learning backend creation ──
patch("WM-008s2: start periodic tick loop after learning backend creation (R5)",
    AGENTDB_BACKEND,
    """                } catch (learnErr) {
                    // Non-fatal: self-learning is an optional enhancement
                }""",
    """                // WM-008s2 (R5): Start periodic tick loop for learning
                    if (this.learningBackend) {
                        const tickMs = this.config.learningTickInterval || 30000;
                        this._tickInterval = setInterval(() => {
                            this.learningBackend?.tick?.().catch(() => {});
                        }, tickMs);
                        if (this._tickInterval.unref) this._tickInterval.unref();
                    }
                } catch (learnErr) {
                    // Non-fatal: self-learning is an optional enhancement
                }""")

# ── Op T (R9): Fix getWitnessChain to use vectorBackend ──
patch("WM-008t: fix getWitnessChain to use vectorBackend (R9)",
    AGENTDB_BACKEND,
    """    getWitnessChain() {
        if (!this.agentdb) return null;
        if (typeof this.agentdb.getWitnessChain === 'function') {
            try { return this.agentdb.getWitnessChain(); } catch { return null; }
        }
        return null;
    }""",
    """    getWitnessChain() {
        if (!this.agentdb) return null;
        // WM-008t (R9): Use vectorBackend for data chain, learning backend for learning chain
        const vb = this.agentdb.vectorBackend;
        if (vb && typeof vb.verifyWitness === 'function') {
            try { return vb.verifyWitness(); } catch {}
        }
        if (this.learningBackend && typeof this.learningBackend.getWitnessChain === 'function') {
            try { return this.learningBackend.getWitnessChain(); } catch {}
        }
        return null;
    }""")
