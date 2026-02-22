# CF-002: Config export shows hardcoded defaults instead of reading YAML
# Absorbed from old patch-16. Applied manually to npx cache.
# NOTE: This patch was originally applied via sed, not via patch().
# The patch() calls below replicate the same changes.

# Op 16a removed: the upstream bundler already emits readYamlConfig() twice.
# CF-004 (order 420) upgrades the first copy to read config.json and removes the second.
# Inserting a third copy here caused a re-application conflict on every run.

# Update getCommand to merge YAML config
patch("16b: config get merge yaml",
    CONF,
    """const configValues = {
            'version': '3.0.0',
            'v3Mode': true,
            'swarm.topology': 'hybrid',
            'swarm.maxAgents': 15,
            'swarm.autoScale': true,
            'memory.backend': 'hybrid',
            'memory.cacheSize': 256,
            'mcp.transport': 'stdio',
            'agents.defaultType': 'coder',
            'agents.maxConcurrent': 15
        };""",
    """// Default config values
        const defaults = {
            'version': '3.0.0',
            'v3Mode': true,
            'swarm.topology': 'hybrid',
            'swarm.maxAgents': 15,
            'swarm.autoScale': true,
            'memory.backend': 'hybrid',
            'memory.cacheSize': 256,
            'mcp.transport': 'stdio',
            'agents.defaultType': 'coder',
            'agents.maxConcurrent': 15
        };
        // Read YAML config and merge with defaults
        const yamlConfig = readYamlConfig();
        const configValues = { ...defaults };
        if (yamlConfig.swarm) {
            if (yamlConfig.swarm.topology) configValues['swarm.topology'] = yamlConfig.swarm.topology;
            if (yamlConfig.swarm.maxAgents) configValues['swarm.maxAgents'] = parseInt(yamlConfig.swarm.maxAgents) || defaults['swarm.maxAgents'];
            if (yamlConfig.swarm.autoScale !== undefined) configValues['swarm.autoScale'] = yamlConfig.swarm.autoScale === 'true' || yamlConfig.swarm.autoScale === true;
        }
        if (yamlConfig.memory) {
            if (yamlConfig.memory.backend) configValues['memory.backend'] = yamlConfig.memory.backend;
            if (yamlConfig.memory.cacheSize) configValues['memory.cacheSize'] = parseInt(yamlConfig.memory.cacheSize) || defaults['memory.cacheSize'];
        }
        if (yamlConfig.mcp && yamlConfig.mcp.transport) {
            configValues['mcp.transport'] = yamlConfig.mcp.transport;
        }
        if (yamlConfig.version) {
            configValues['version'] = yamlConfig.version;
        }""")

# Update exportCommand to merge YAML config
patch("16c: config export merge yaml",
    CONF,
    """const config = {
            version: '3.0.0',
            exportedAt: new Date().toISOString(),
            agents: { defaultType: 'coder', maxConcurrent: 15 },
            swarm: { topology: 'hybrid', maxAgents: 15 },
            memory: { backend: 'hybrid', cacheSize: 256 },
            mcp: { transport: 'stdio', tools: 'all' }
        };""",
    """// Start with defaults
        const config = {
            version: '3.0.0',
            exportedAt: new Date().toISOString(),
            agents: { defaultType: 'coder', maxConcurrent: 15 },
            swarm: { topology: 'hybrid', maxAgents: 15 },
            memory: { backend: 'hybrid', cacheSize: 256 },
            mcp: { transport: 'stdio', tools: 'all' }
        };
        // Read YAML config and merge
        const yamlConfig = readYamlConfig();
        if (yamlConfig.version) { config.version = yamlConfig.version; }
        if (yamlConfig.swarm) {
            if (yamlConfig.swarm.topology) config.swarm.topology = yamlConfig.swarm.topology;
            if (yamlConfig.swarm.maxAgents) config.swarm.maxAgents = parseInt(yamlConfig.swarm.maxAgents) || 15;
        }
        if (yamlConfig.memory) {
            if (yamlConfig.memory.backend) config.memory.backend = yamlConfig.memory.backend;
            if (yamlConfig.memory.cacheSize) config.memory.cacheSize = parseInt(yamlConfig.memory.cacheSize) || 256;
        }
        if (yamlConfig.mcp && yamlConfig.mcp.transport) {
            config.mcp.transport = yamlConfig.mcp.transport;
        }""")
