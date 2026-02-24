// Minimal fixture for WM-008n testing — shared config defaults
export const defaultMemoryConfig = {
    backend: 'hybrid',
    path: './data/memory',
    sqlite: {
        inMemory: false,
        wal: true,
    },
    agentdb: {
        dimensions: 1536,
        indexType: 'hnsw',
        efConstruction: 200,
        m: 16,
        quantization: 'none',
    },
    hybrid: {
        vectorThreshold: 100,
    },
};
export default { memory: defaultMemoryConfig };
