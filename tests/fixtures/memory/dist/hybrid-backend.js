/**
 * HybridBackend - Combines SQLite + AgentDB
 *
 * Minimal fixture for WM-012 testing -- matches old_string patterns from hybrid-backend.js
 */

import { EventEmitter } from 'node:events';
export class HybridBackend extends EventEmitter {
    sqlite;
    agentdb;
    config;
    initialized = false;
    constructor(config = {}) {
        super();
        this.config = config;
    }
    async initialize() {
        this.initialized = true;
    }
    async shutdown() {
        this.initialized = false;
    }
    async store(entry) {}
    async get(id) { return null; }
    async search(embedding, options) { return []; }
    getSQLiteBackend() {
        return this.sqlite;
    }
    getAgentDBBackend() {
        return this.agentdb;
    }
}
export default HybridBackend;
