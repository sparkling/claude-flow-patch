# 1008: memory stats fails when memory_stats MCP tool is unavailable
# GitHub: #1008

MEM_CMD = commands + "/memory.js" if commands else ""

patch("1008a: memory stats fallback to memory_list when memory_stats is unavailable",
    MEM_CMD,
    """            const statsResult = await callMCPTool('memory_stats', {});
            const stats = {
                backend: statsResult.backend,
                entries: {
                    total: statsResult.totalEntries,
                    vectors: 0, // Would need vector backend support
                    text: statsResult.totalEntries
                },
                storage: {
                    total: statsResult.totalSize,
                    location: statsResult.location
                },
                version: statsResult.version,
                oldestEntry: statsResult.oldestEntry,
                newestEntry: statsResult.newestEntry
            };""",
    """            let statsResult;
            try {
                statsResult = await callMCPTool('memory_stats', {});
            }
            catch {
                const listResult = await callMCPTool('memory_list', { limit: 1, offset: 0 });
                const totalEntries = listResult?.total ?? (Array.isArray(listResult?.entries) ? listResult.entries.length : 0);
                statsResult = {
                    backend: 'sqlite',
                    totalEntries,
                    totalSize: 'Unknown',
                    location: '.claude-flow/memory.db',
                    version: '3.0.0',
                    oldestEntry: null,
                    newestEntry: null
                };
            }
            const stats = {
                backend: statsResult.backend || 'sqlite',
                entries: {
                    total: statsResult.totalEntries ?? 0,
                    vectors: 0, // Would need vector backend support
                    text: statsResult.totalEntries ?? 0
                },
                storage: {
                    total: statsResult.totalSize || 'Unknown',
                    location: statsResult.location || '.claude-flow/memory.db'
                },
                version: statsResult.version || '3.0.0',
                oldestEntry: statsResult.oldestEntry,
                newestEntry: statsResult.newestEntry
            };""")
