# MM-001: memory-initializer.js ignores persistPath config, hardcodes .swarm/

patch("MM-001: read persistPath from config",
    MI,
    """        // Persistent storage paths
        const swarmDir = path.join(process.cwd(), '.swarm');
        if (!fs.existsSync(swarmDir)) {
            fs.mkdirSync(swarmDir, { recursive: true });
        }
        const hnswPath = path.join(swarmDir, 'hnsw.index');
        const metadataPath = path.join(swarmDir, 'hnsw.metadata.json');
        const dbPath = options?.dbPath || path.join(swarmDir, 'memory.db');""",
    """        // MM-001: Read persistPath from config instead of hardcoding .swarm/
        let dataDir = path.join(process.cwd(), '.swarm'); // fallback
        try {
            const configJsonPath = path.join(process.cwd(), '.claude-flow', 'config.json');
            const configYamlPath = path.join(process.cwd(), '.claude-flow', 'config.yaml');
            if (fs.existsSync(configJsonPath)) {
                const config = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
                const persistPath = config.values?.['memory.persistPath'];
                if (persistPath) {
                    dataDir = path.isAbsolute(persistPath) ? persistPath : path.join(process.cwd(), persistPath);
                }
            } else if (fs.existsSync(configYamlPath)) {
                const yamlContent = fs.readFileSync(configYamlPath, 'utf-8');
                const match = yamlContent.match(/persistPath:\\s*([^\\n]+)/);
                if (match) {
                    const persistPath = match[1].trim();
                    dataDir = path.isAbsolute(persistPath) ? persistPath : path.join(process.cwd(), persistPath);
                }
            }
        } catch { /* use fallback */ }
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const hnswPath = path.join(dataDir, 'hnsw.index');
        const metadataPath = path.join(dataDir, 'hnsw.metadata.json');
        const dbPath = options?.dbPath || path.join(dataDir, 'memory.db');""")
