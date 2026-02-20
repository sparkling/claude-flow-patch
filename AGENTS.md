# @sparkleideas/claude-flow-patch

> Runtime patches for `@claude-flow/cli` v3.1.0-alpha.41, `ruvector`, and `ruv-swarm` v1.0.20

**Claude Code instructions are in [CLAUDE.md](CLAUDE.md). Project-specific instructions (defect index, workflows, policies) are in [README.md](README.md).**

## Project Overview

A Claude Flow powered project

**Tech Stack**: Python (patches), Bash (orchestration)
**Architecture**: Idempotent runtime patching via string replacement

## Quick Start

### Apply Patches
```bash
bash patch-all.sh
```

### Verify
```bash
bash check-patches.sh
```

## Agent Coordination

### Swarm Configuration

This project uses hierarchical swarm coordination for complex tasks:

| Setting | Value | Purpose |
|---------|-------|---------|
| Topology | `hierarchical` | Queen-led coordination (anti-drift) |
| Max Agents | 8 | Optimal team size |
| Strategy | `specialized` | Clear role boundaries |
| Consensus | `raft` | Leader-based consistency |

### When to Use Swarms

**Invoke swarm for:**
- Multi-file changes (3+ files)
- New feature implementation
- Cross-module refactoring
- API changes with tests
- Security-related changes
- Performance optimization

**Skip swarm for:**
- Single file edits
- Simple bug fixes (1-2 lines)
- Documentation updates
- Configuration changes

### Available Skills

Use `$skill-name` syntax to invoke:

| Skill | Use Case |
|-------|----------|
| `$swarm-orchestration` | Multi-agent task coordination |
| `$memory-management` | Pattern storage and retrieval |
| `$sparc-methodology` | Structured development workflow |
| `$security-audit` | Security scanning and CVE detection |

### Agent Types

| Type | Role | Use Case |
|------|------|----------|
| `researcher` | Requirements analysis | Understanding scope |
| `architect` | System design | Planning structure |
| `coder` | Implementation | Writing code |
| `tester` | Test creation | Quality assurance |
| `reviewer` | Code review | Security and quality |

## Code Standards

### File Organization
- **NEVER** save to root folder
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation
- `/config` - Configuration files

### Quality Rules
- Files under 500 lines
- No hardcoded secrets
- Input validation at boundaries
- Typed interfaces for public APIs
- TDD London School (mock-first) preferred

### Commit Messages
```
<type>(<scope>): <description>

[optional body]

Sparkling Ideas <henrik@sparklingideas.co.uk>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

## Security

### Critical Rules
- NEVER commit secrets, credentials, or .env files
- NEVER hardcode API keys
- Always validate user input
- Use parameterized queries for SQL
- Sanitize output to prevent XSS

### Path Security
- Validate all file paths
- Prevent directory traversal (../)
- Use absolute paths internally

## Memory System

### Storing Patterns
```bash
npx @claude-flow/cli memory store \
  --key "pattern-name" \
  --value "pattern description" \
  --namespace patterns
```

### Searching Memory
```bash
npx @claude-flow/cli memory search \
  --query "search terms" \
  --namespace patterns
```

## Links

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues

## Guidance Lifecycle Wiring (Codex)

Codex does not expose Claude Code-style event-command hook maps in `config.toml`.
This project uses an explicit bridge script:

- `scripts/guidance-codex-bridge.js` -> dispatches lifecycle events to:
  - `.claude/helpers/hook-handler.cjs` (enforcement path)
  - optional `npx @claude-flow/cli@latest hooks ...` telemetry calls

Primary commands:

```bash
npm run guidance:codex:session-start
npm run guidance:codex:pre-task -- --description "Implement feature X"
npm run guidance:codex:pre-command -- --command "git status"
npm run guidance:codex:pre-edit -- --file src/example.ts
npm run guidance:codex:post-edit -- --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed
npm run guidance:codex:session-end
```

Control flags:
- `--skip-cf-hooks` skips secondary `@claude-flow/cli` hook invocations
- `GUIDANCE_CODEX_SKIP_CF_HOOKS=1` disables secondary invocations globally
