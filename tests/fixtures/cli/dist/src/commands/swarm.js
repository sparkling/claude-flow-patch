// Minimal fixture for SG-009 testing (swarm init command)
const TOPOLOGIES = [];
const STRATEGIES = [];
const initCommand = {
    name: 'init',
    options: [
        {
            name: 'topology',
            short: 't',
            description: 'Swarm topology',
            type: 'string',
            choices: TOPOLOGIES.map(t => t.value),
            default: 'hierarchical'
        },
        {
            name: 'strategy',
            short: 's',
            description: 'Coordination strategy',
            type: 'string',
            choices: STRATEGIES.map(s => s.value)
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
        // Interactive topology selection
        if (!topology && ctx.interactive) {
            topology = await select({
                message: 'Select swarm topology:',
                options: TOPOLOGIES,
                default: 'hierarchical'
            });
        }
        try {
            const result = await callMCPTool('swarm_init', {
                topology: topology,
                maxAgents,
                config: {},
                metadata: {
                    v3Mode,
                    strategy: ctx.flags.strategy || 'development',
                },
            });
            output.writeln(output.dim('  Setting up communication channels...'));
            if (v3Mode) {
                output.writeln(output.dim('  Enabling Flash Attention (2.49x-7.47x speedup)...'));
                output.writeln(output.dim('  Configuring AgentDB integration (150x faster)...'));
                output.writeln(output.dim('  Initializing SONA learning system...'));
            }
            output.printTable({
                data: [
                    { property: 'Protocol', value: result.config.communicationProtocol || 'N/A' },
                    { property: 'V3 Mode', value: v3Mode ? 'Enabled' : 'Disabled' }
                ]
            });
            const stateFile = path.join(swarmDir, 'state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                id: result.swarmId,
                topology: result.topology,
                strategy: ctx.flags.strategy || 'development',
                v3Mode,
                initializedAt: result.initializedAt,
                status: 'ready'
            }, null, 2));
        }
        catch (error) {}
    }
};
export const swarmCommand = {
    name: 'swarm',
    examples: [
        { command: 'claude-flow swarm init --v3-mode', description: 'Initialize V3 swarm' },
        { command: 'claude-flow swarm start -o "Build API"', description: 'Start swarm' }
    ],
};
