// Minimal fixture for SG-003, IN-001, MM-001, SG-008 testing
import * as fs from 'node:fs';
import * as path from 'node:path';

async function writeRuntimeConfig(targetDir, options, result) {
    const configPath = path.join(targetDir, '.claude-flow', 'config.yaml');
    if (fs.existsSync(configPath) && !options.force) {
        result.skipped.push('.claude-flow/config.yaml');
        return;
    }
    const config = `# Claude Flow V3 Runtime Configuration
# Generated: ${new Date().toISOString()}

version: "3.0.0"

swarm:
  topology: ${options.runtime.topology}
  maxAgents: ${options.runtime.maxAgents}
  autoScale: true
  coordinationStrategy: consensus

memory:
  backend: ${options.runtime.memoryBackend}
  enableHNSW: ${options.runtime.enableHNSW}
  cacheSize: 100
  # ADR-049: Self-Learning Memory
  learningBridge:
    enabled: ${options.runtime.enableLearningBridge ?? options.runtime.enableNeural}
    sonaMode: balanced
    confidenceDecayRate: 0.005
    accessBoostAmount: 0.03
    consolidationThreshold: 10
  memoryGraph:
    enabled: ${options.runtime.enableMemoryGraph ?? true}
    pageRankDamping: 0.85
    maxNodes: 5000
    similarityThreshold: 0.8
  agentScopes:
    enabled: ${options.runtime.enableAgentScopes ?? true}
    defaultScope: project

neural:
  enabled: ${options.runtime.enableNeural}
  modelPath: .claude-flow/neural

hooks:
  enabled: true
  autoExecute: true

mcp:
  autoStart: ${options.mcp.autoStart}
  port: ${options.mcp.port}
`;
    fs.writeFileSync(configPath, config, 'utf-8');
    result.created.files.push('.claude-flow/config.yaml');
    // Write .gitignore
    const gitignorePath = path.join(targetDir, '.claude-flow', '.gitignore');
}

async function executeInit(targetDir, options, result) {
        // Generate helpers
        if (options.components.helpers) {
            await writeHelpers(targetDir, options, result);
        }
        // Generate statusline
        if (options.components.statusline) {
            await writeStatusline(targetDir, options, result);
        }
        // Generate runtime config
        const configPath = path.join(targetDir, '.claude', 'config.yaml');
}

async function executeUpgrade(targetDir, result) {
            const criticalHelpers = ['auto-memory-hook.mjs', 'hook-handler.cjs', 'intelligence.cjs'];

            const generatedCritical = {
                'hook-handler.cjs': generateHookHandler(),
                'intelligence.cjs': intelligenceContent,
                'auto-memory-hook.mjs': generateAutoMemoryHook(),
            };
}

// SG-011c fixture: CAPABILITIES.md topology references (old_string for SG-011c)
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8

// SG-008b fixture: CAPABILITIES.md template with config.yaml reference
const capabilitiesTemplate = `
.claude-flow/
├── config.yaml      # Runtime configuration
├── CAPABILITIES.md  # This file
`;
