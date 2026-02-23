// Minimal fixture for SG-009, SG-011 testing (CLAUDE.md template)
export function generateClaudeMd() {
    return `### Quick CLI Examples

\`\`\`bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
\`\`\``;
}

// SG-011b fixture: anti-drift and auto-start topology references
function antiDriftConfig() {
    return `npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized`;
}
function autoStartProtocol() {
    return `Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized")`;
}
