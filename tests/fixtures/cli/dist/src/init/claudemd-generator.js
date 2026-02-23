// Minimal fixture for SG-009 testing (CLAUDE.md template)
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
