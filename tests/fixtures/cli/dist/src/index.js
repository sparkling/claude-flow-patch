// Minimal fixture for SG-009 testing (CLI help text)
class ClaudeFlowCLI {
    showHelp() {
        this.output.writeln(`  ${this.name} agent spawn -t coder              # Spawn a coder agent`);
        this.output.writeln(`  ${this.name} swarm init --v3-mode              # Initialize V3 swarm`);
        this.output.writeln(`  ${this.name} memory search -q "auth patterns"  # Semantic search`);
    }
}
