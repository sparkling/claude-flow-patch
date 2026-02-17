# UI-001: intelligence stats crashes on .toFixed() of undefined
# Absorbed from old patch-17. Applied via sed to npx cache.

# SONA component null checks
patch("17a: SONA learningTimeMs null check",
    HOOKS_CMD,
    "{ metric: 'Learning Time', value: `${result.components.sona.learningTimeMs.toFixed(3)}ms` }",
    "{ metric: 'Learning Time', value: result.components.sona.learningTimeMs != null ? `${result.components.sona.learningTimeMs.toFixed(3)}ms` : 'N/A' }")

patch("17b: SONA adaptationTimeMs null check",
    HOOKS_CMD,
    "{ metric: 'Adaptation Time', value: `${result.components.sona.adaptationTimeMs.toFixed(3)}ms` }",
    "{ metric: 'Adaptation Time', value: result.components.sona.adaptationTimeMs != null ? `${result.components.sona.adaptationTimeMs.toFixed(3)}ms` : 'N/A' }")

patch("17c: SONA avgQuality null check",
    HOOKS_CMD,
    "{ metric: 'Avg Quality', value: `${(result.components.sona.avgQuality * 100).toFixed(1)}%` }",
    "{ metric: 'Avg Quality', value: result.components.sona.avgQuality != null ? `${(result.components.sona.avgQuality * 100).toFixed(1)}%` : 'N/A' }")

# MoE component null checks
patch("17d: MoE routingAccuracy null check",
    HOOKS_CMD,
    "{ metric: 'Routing Accuracy', value: `${(result.components.moe.routingAccuracy * 100).toFixed(1)}%` }",
    "{ metric: 'Routing Accuracy', value: result.components.moe.routingAccuracy != null ? `${(result.components.moe.routingAccuracy * 100).toFixed(1)}%` : 'N/A' }")

patch("17e: MoE loadBalance null check",
    HOOKS_CMD,
    "{ metric: 'Load Balance', value: `${(result.components.moe.loadBalance * 100).toFixed(1)}%` }",
    "{ metric: 'Load Balance', value: result.components.moe.loadBalance != null ? `${(result.components.moe.loadBalance * 100).toFixed(1)}%` : 'N/A' }")

# Embeddings null check
patch("17f: embeddings cacheHitRate null check",
    HOOKS_CMD,
    "{ metric: 'Cache Hit Rate', value: `${(result.components.embeddings.cacheHitRate * 100).toFixed(1)}%` }",
    "{ metric: 'Cache Hit Rate', value: result.components.embeddings.cacheHitRate != null ? `${(result.components.embeddings.cacheHitRate * 100).toFixed(1)}%` : 'N/A' }")

# Performance section null guard
patch("17g: performance section null guard",
    HOOKS_CMD,
    """            output.printList([
                `Flash Attention: ${output.success(result.performance.flashAttention)}`,
                `Memory Reduction: ${output.success(result.performance.memoryReduction)}`,
                `Search Improvement: ${output.success(result.performance.searchImprovement)}`,
                `Token Reduction: ${output.success(result.performance.tokenReduction)}`,
                `SWE-Bench Score: ${output.success(result.performance.sweBenchScore)}`
            ]);""",
    """            if (result.performance) {
                output.printList([
                    `Flash Attention: ${output.success(result.performance.flashAttention || 'N/A')}`,
                    `Memory Reduction: ${output.success(result.performance.memoryReduction || 'N/A')}`,
                    `Search Improvement: ${output.success(result.performance.searchImprovement || 'N/A')}`,
                    `Token Reduction: ${output.success(result.performance.tokenReduction || 'N/A')}`,
                    `SWE-Bench Score: ${output.success(result.performance.sweBenchScore || 'N/A')}`
                ]);
            } else {
                output.writeln(output.dim('  No performance data available'));
            }""")
