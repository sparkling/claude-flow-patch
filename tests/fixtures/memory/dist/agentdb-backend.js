/**
 * AgentDB Backend - Integration with agentdb@2.0.0-alpha.3.4
 *
 * Minimal fixture for WM-008 testing — matches old_string patterns from agentdb-backend.js
 */

import { EventEmitter } from 'node:events';
let AgentDB;
let HNSWIndex;
let isHnswlibAvailable;
let agentdbImportPromise;
function ensureAgentDBImport() {
    if (!agentdbImportPromise) {
        agentdbImportPromise = (async () => {
            try {
                const agentdbModule = await import('agentdb');
                AgentDB = agentdbModule.AgentDB || agentdbModule.default;
                HNSWIndex = agentdbModule.HNSWIndex;
                isHnswlibAvailable = agentdbModule.isHnswlibAvailable;
            }
            catch (error) {
                // AgentDB not available - will use fallback
            }
        })();
    }
    return agentdbImportPromise;
}
const DEFAULT_CONFIG = {
    namespace: 'default',
    forceWasm: false,
    vectorBackend: 'auto',
    vectorDimension: 1536,
    hnswM: 16,
    hnswEfConstruction: 200,
    hnswEfSearch: 100,
    cacheEnabled: true,
    maxEntries: 1000000,
};
export class AgentDBBackend extends EventEmitter {
    config;
    agentdb;
    initialized = false;
    available = false;
    entries = new Map();
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    async initialize() {
        if (this.initialized)
            return;
        await ensureAgentDBImport();
        this.available = AgentDB !== undefined;
        if (!this.available) {
            this.initialized = true;
            return;
        }
        try {
            this.agentdb = new AgentDB({
                dbPath: this.config.dbPath || ':memory:',
            });
            await this.agentdb.initialize();
            await this.createSchema();
            this.initialized = true;
            this.emit('initialized', {
                backend: this.agentdb.vectorBackendName,
                isWasm: this.agentdb.isWasm,
            });
        }
        catch (error) {
            this.available = false;
            this.initialized = true;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        if (this.agentdb) {
            await this.agentdb.close();
        }
        this.initialized = false;
        this.emit('shutdown');
    }
    async store(entry) {
        this.entries.set(entry.id, entry);
    }
    async get(id) {
        return this.entries.get(id) ?? null;
    }
    async getByKey(namespace, key) {
        return null;
    }
    isAvailable() {
        return this.available;
    }
    getAgentDB() {
        return this.agentdb;
    }
}
export default AgentDBBackend;
