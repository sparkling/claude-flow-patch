# 1032: memory_store crashes on undefined/null value
# GitHub: #1032

MEM_TOOLS = base + "/mcp-tools/memory-tools.js" if base else ""

patch("1032a: validate memory_store input.value",
    MEM_TOOLS,
    """if (!namespace || namespace === 'all') {
                throw new Error('Namespace is required (cannot be "all"). Use namespace: "patterns", "solutions", or "tasks"');
            }
            const value = typeof input.value === 'string' ? input.value : JSON.stringify(input.value);""",
    """if (!namespace || namespace === 'all') {
                throw new Error('Namespace is required (cannot be "all"). Use namespace: "patterns", "solutions", or "tasks"');
            }
            if (input.value === undefined || input.value === null) {
                return {
                    success: false,
                    key,
                    namespace,
                    stored: false,
                    storedAt: new Date().toISOString(),
                    hasEmbedding: false,
                    embeddingDimensions: null,
                    backend: 'sql.js + HNSW',
                    storeTime: '0.00ms',
                    error: 'Missing required parameter: value',
                };
            }
            const value = typeof input.value === 'string' ? input.value : JSON.stringify(input.value);
            if (value === undefined) {
                return {
                    success: false,
                    key,
                    namespace,
                    stored: false,
                    storedAt: new Date().toISOString(),
                    hasEmbedding: false,
                    embeddingDimensions: null,
                    backend: 'sql.js + HNSW',
                    storeTime: '0.00ms',
                    error: 'Invalid value: could not serialize input.value',
                };
            }""")

patch("1032b: guard embedding generation when value is non-string",
    MI,
    "if (generateEmbeddingFlag && value.length > 0) {",
    "if (generateEmbeddingFlag && typeof value === 'string' && value.length > 0) {")
