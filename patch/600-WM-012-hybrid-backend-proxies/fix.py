# WM-012: HybridBackend proxy methods for learning + witness chain
# GitHub: #1212

# ── Op A: Add recordFeedback proxy to HybridBackend ──
# Delegates to AgentDBBackend.recordFeedback() for self-learning loop.
# Gracefully returns undefined if agentdb backend lacks the method.
patch("WM-012a: Add recordFeedback proxy to HybridBackend",
    HYBRID_BACKEND,
    """    getAgentDBBackend() {
        return this.agentdb;
    }""",
    """    getAgentDBBackend() {
        return this.agentdb;
    }
    // WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }""")

# ── Op B: Add verifyWitnessChain + getWitnessChain proxies ──
# Dependent on WM-012a (old_string includes text inserted by WM-012a).
# verifyWitnessChain() returns { valid: true, reason: 'no-agentdb-backend' } when unavailable.
# getWitnessChain() returns null when unavailable.
patch("WM-012b: Add verifyWitnessChain + getWitnessChain proxies to HybridBackend",
    HYBRID_BACKEND,
    """    // WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }""",
    """    // WM-012a: Proxy recordFeedback to AgentDBBackend for self-learning
    async recordFeedback(queryId, quality) {
        if (this.agentdb && typeof this.agentdb.recordFeedback === 'function') {
            return await this.agentdb.recordFeedback(queryId, quality);
        }
    }
    // WM-012b: Proxy verifyWitnessChain to AgentDBBackend for tamper detection
    async verifyWitnessChain() {
        if (this.agentdb && typeof this.agentdb.verifyWitnessChain === 'function') {
            return await this.agentdb.verifyWitnessChain();
        }
        return { valid: true, reason: 'no-agentdb-backend' };
    }
    // WM-012c: Proxy getWitnessChain to AgentDBBackend
    getWitnessChain() {
        if (this.agentdb && typeof this.agentdb.getWitnessChain === 'function') {
            return this.agentdb.getWitnessChain();
        }
        return null;
    }""")
