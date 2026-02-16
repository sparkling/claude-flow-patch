# claude-flow-patch

> Runtime patches for `@claude-flow/cli` v3.1.0-alpha.40, `ruvector`, and `ruv-swarm` v1.0.20.

**Full defect index, workflows, policies, and checklists are in [CLAUDE.md](CLAUDE.md).**
CLAUDE.md is the single source of truth -- do not duplicate its content here.

## Project Overview

**Tech Stack**: Python (patches), Bash (orchestration)
**Architecture**: Idempotent runtime patching via string replacement

## Quick Start

```bash
# Apply all patches
bash patch-all.sh

# Verify patches
bash check-patches.sh
```

## Agent Coordination

### Swarm Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Topology | `hierarchical` | Queen-led coordination (anti-drift) |
| Max Agents | 8 | Optimal team size |
| Strategy | `specialized` | Clear role boundaries |
| Consensus | `raft` | Leader-based consistency |

### When to Use Swarms

**Invoke swarm for:**
- Multi-defect batch patching (3+ defects)
- New defect creation (research + implement + verify)
- Cross-category refactoring

**Skip swarm for:**
- Single defect fix
- Sentinel check
- Documentation-only updates

### Agent Types

| Type | Role | Use Case |
|------|------|----------|
| `researcher` | Defect analysis | Reading GitHub issues, understanding root cause |
| `coder` | Patch implementation | Writing fix.py scripts |
| `tester` | Verification | Running patch-all.sh and check-patches.sh |
| `reviewer` | Code review | Checking patch correctness and idempotency |

## Available Skills

Use `$skill-name` syntax to invoke:

| Skill | Use Case |
|-------|----------|
| `$swarm-orchestration` | Multi-agent task coordination |
| `$memory-management` | Pattern storage and retrieval |
| `$sparc-methodology` | Structured development workflow |
| `$security-audit` | Security scanning and CVE detection |

## Platform Compatibility

| Platform | Config File | Skill Syntax |
|----------|-------------|--------------|
| Claude Code | CLAUDE.md + .claude/ | /skill-name |
| OpenAI Codex | AGENTS.md + .agents/ | $skill-name |

### Configuration

- **Codex**: `.agents/config.toml` (project), `.codex/config.toml` (local, gitignored)
- **Claude Code**: `CLAUDE.md` + `.claude/settings.json`

## MCP Integration

```bash
npx @claude-flow/cli@latest mcp start
```

## Code Standards

- NEVER modify files inside the npm/npx cache directly -- edit `fix.py` scripts in `patch/`
- NEVER run individual `fix.py` files standalone -- always use `bash patch-all.sh`
- ALWAYS verify with `bash check-patches.sh` after applying
- Patch order matters: NS-001 before NS-002 before NS-003

## Security

- NEVER commit .env files or secrets
- NEVER hardcode API keys
- Patches only modify the npx cache, never the npm registry package

## Memory System

### Storing Patterns
```bash
npx @claude-flow/cli@latest memory store \
  --key "pattern-name" \
  --value "pattern description" \
  --namespace patterns
```

### Searching Memory
```bash
npx @claude-flow/cli@latest memory search \
  --query "search terms" \
  --namespace patterns
```

## Links

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues
