# SG-009: Remove --v3-mode from swarm init, make v3 the default
# GitHub: #1202

SWARM_CMD = commands + "/swarm.js" if commands else ""

# SG-009a: topology option default 'hierarchical' -> 'hierarchical-mesh'
patch("SG-009a: topology option default to hierarchical-mesh",
    SWARM_CMD,
    """            name: 'topology',
            short: 't',
            description: 'Swarm topology',
            type: 'string',
            choices: TOPOLOGIES.map(t => t.value),
            default: 'hierarchical'""",
    """            name: 'topology',
            short: 't',
            description: 'Swarm topology',
            type: 'string',
            choices: TOPOLOGIES.map(t => t.value),
            default: 'hierarchical-mesh'""")

# SG-009b: remove --v3-mode option declaration + v3Mode variable + if block
patch("SG-009b: remove --v3-mode option and v3Mode logic",
    SWARM_CMD,
    """            choices: STRATEGIES.map(s => s.value)
        },
        {
            name: 'v3-mode',
            description: 'Enable V3 15-agent hierarchical mesh mode',
            type: 'boolean',
            default: false
        }
    ],
    action: async (ctx) => {
        let topology = ctx.flags.topology;
        const maxAgents = ctx.flags.maxAgents || 15;
        const v3Mode = ctx.flags.v3Mode;
        // V3 mode enables hierarchical-mesh hybrid
        if (v3Mode) {
            topology = 'hierarchical-mesh';
            output.printInfo('V3 Mode: Using hierarchical-mesh topology with 15-agent coordination');
        }
        // Interactive topology selection""",
    """            choices: STRATEGIES.map(s => s.value)
        }
    ],
    action: async (ctx) => {
        let topology = ctx.flags.topology;
        const maxAgents = ctx.flags.maxAgents || 15;
        // Interactive topology selection""")

# SG-009c: interactive selector default 'hierarchical' -> 'hierarchical-mesh'
patch("SG-009c: interactive selector default to hierarchical-mesh",
    SWARM_CMD,
    """            topology = await select({
                message: 'Select swarm topology:',
                options: TOPOLOGIES,
                default: 'hierarchical'
            });""",
    """            topology = await select({
                message: 'Select swarm topology:',
                options: TOPOLOGIES,
                default: 'hierarchical-mesh'
            });""")

# SG-009d: remove if (v3Mode) guard, keep Flash Attention/AgentDB/SONA lines
patch("SG-009d: always show Flash Attention/AgentDB/SONA lines",
    SWARM_CMD,
    """            if (v3Mode) {
                output.writeln(output.dim('  Enabling Flash Attention (2.49x-7.47x speedup)...'));
                output.writeln(output.dim('  Configuring AgentDB integration (150x faster)...'));
                output.writeln(output.dim('  Initializing SONA learning system...'));
            }""",
    """            output.writeln(output.dim('  Enabling Flash Attention (2.49x-7.47x speedup)...'));
            output.writeln(output.dim('  Configuring AgentDB integration (150x faster)...'));
            output.writeln(output.dim('  Initializing SONA learning system...'));""")

# SG-009e: remove V3 Mode row from status table
# Include closing ] to prevent new string being a substring of the old code
patch("SG-009e: remove V3 Mode row from status table",
    SWARM_CMD,
    """                    { property: 'Protocol', value: result.config.communicationProtocol || 'N/A' },
                    { property: 'V3 Mode', value: v3Mode ? 'Enabled' : 'Disabled' }
                ]""",
    """                    { property: 'Protocol', value: result.config.communicationProtocol || 'N/A' }
                ]""")

# SG-009f: remove v3Mode from MCP metadata
patch("SG-009f: remove v3Mode from MCP metadata",
    SWARM_CMD,
    """                metadata: {
                    v3Mode,
                    strategy: ctx.flags.strategy || 'development',
                },""",
    """                metadata: {
                    strategy: ctx.flags.strategy || 'development',
                },""")

# SG-009g: remove v3Mode from saved state.json
patch("SG-009g: remove v3Mode from saved state",
    SWARM_CMD,
    """                    strategy: ctx.flags.strategy || 'development',
                    v3Mode,
                    initializedAt: result.initializedAt,""",
    """                    strategy: ctx.flags.strategy || 'development',
                    initializedAt: result.initializedAt,""")

# SG-009h: update example to remove --v3-mode
patch("SG-009h: update example",
    SWARM_CMD,
    """        { command: 'claude-flow swarm init --v3-mode', description: 'Initialize V3 swarm' },""",
    """        { command: 'claude-flow swarm init', description: 'Initialize V3 swarm' },""")

# SG-009i: remove --v3-mode from CLI help text in index.js
patch("SG-009i: remove --v3-mode from CLI help example",
    CLI_INDEX,
    """swarm init --v3-mode              # Initialize V3 swarm""",
    """swarm init                        # Initialize V3 swarm""")

# SG-009j: remove --v3-mode from CLAUDE.md template in claudemd-generator.js
# Include trailing context (memory search line) so new string is unique
patch("SG-009j: remove --v3-mode from CLAUDE.md template",
    CLAUDEMD_GEN,
    """swarm init --v3-mode
npx @claude-flow/cli@latest memory search""",
    """swarm init
npx @claude-flow/cli@latest memory search""")

# SG-009k: remove v3Mode from start-all swarm_init call in start.js
# Include closing }) so new string is unique
patch("SG-009k: remove v3Mode from start-all swarm_init",
    START_CMD,
    """            autoScaling: swarmConfig.autoScale !== false,
            v3Mode: true
        });""",
    """            autoScaling: swarmConfig.autoScale !== false
        });""")

# SG-009l: remove v3Mode from config init defaults in config.js
# Include leading context (version line) so new string is unique
patch("SG-009l: remove v3Mode from config init defaults",
    CONF,
    """            version: '3.0.0',
            v3Mode: v3,
            sparc: sparc,""",
    """            version: '3.0.0',
            sparc: sparc,""")

# SG-009m: remove V3 Mode row from config show table
# Include trailing context (SPARC row) so new string is unique
patch("SG-009m: remove V3 Mode from config show table",
    CONF,
    """                { setting: 'Version', value: config.version },
                { setting: 'V3 Mode', value: config.v3Mode ? 'Enabled' : 'Disabled' },
                { setting: 'SPARC Mode'""",
    """                { setting: 'Version', value: config.version },
                { setting: 'SPARC Mode'""")

# SG-009n: remove v3Mode from config get defaults
# Include trailing context (swarm.topology) so new string is unique
patch("SG-009n: remove v3Mode from config get defaults",
    CONF,
    """            'version': '3.0.0',
            'v3Mode': true,
            'swarm.topology'""",
    """            'version': '3.0.0',
            'swarm.topology'""")

# SG-009o: config init topology 'hybrid' -> 'hierarchical-mesh'
# Include surrounding swarm block context to avoid matching memory.backend: 'hybrid'
patch("SG-009o: config init topology to hierarchical-mesh",
    CONF,
    """            swarm: {
                topology: 'hybrid',
                maxAgents: 15,
                autoScale: true,
                coordinationStrategy: 'consensus'
            },""",
    """            swarm: {
                topology: 'hierarchical-mesh',
                maxAgents: 15,
                autoScale: true,
                coordinationStrategy: 'consensus'
            },""")

# SG-009p: config get topology default 'hybrid' -> 'hierarchical-mesh'
# Include leading 'version' context to be unique
patch("SG-009p: config get topology default to hierarchical-mesh",
    CONF,
    """            'version': '3.0.0',
            'swarm.topology': 'hybrid',""",
    """            'version': '3.0.0',
            'swarm.topology': 'hierarchical-mesh',""")

# SG-009q: config export topology 'hybrid' -> 'hierarchical-mesh'
# Include agents line before and memory line after to be unique
patch("SG-009q: config export topology to hierarchical-mesh",
    CONF,
    """            agents: { defaultType: 'coder', maxConcurrent: 15 },
            swarm: { topology: 'hybrid', maxAgents: 15 },
            memory: { backend: 'hybrid', cacheSize: 256 },""",
    """            agents: { defaultType: 'coder', maxConcurrent: 15 },
            swarm: { topology: 'hierarchical-mesh', maxAgents: 15 },
            memory: { backend: 'hybrid', cacheSize: 256 },""")
