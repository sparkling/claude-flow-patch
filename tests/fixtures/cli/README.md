# Claude Flow CLI

## Doctor Checks

| Check | Expected | Auto-Fix |
|-------|----------|----------|
| **npm version** | 9+ | ❌ Manual upgrade required |
| **Config file validity** | Valid JSON/YAML | ✅ Regenerates defaults |
| **Daemon status** | Running | ✅ Restarts daemons |

```bash
# Check specific component
npx ruflo@v3alpha doctor --component memory

# Verbose output
npx ruflo@v3alpha doctor --verbose
```

**Output Example:**

```
✅ Config       Valid claude-flow.config.json
✅ Daemon       Running (PID: 12345)
✅ Memory       SQLite healthy, 1.2MB
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_FLOW_CONFIG` | Path to configuration file | `./claude-flow.config.json` |

### Configuration File Location

Ruflo looks for configuration in this order:
1. `./claude-flow.config.json` (project root)
2. `~/.config/ruflo/config.json` (user config)
3. Environment variables (override any file config)

### Complete Configuration Schema

```json
{
  "memory": {
    "type": "hybrid",
    "path": "./data",
    "maxEntries": 10000,
    "ttl": 86400,
    "hnsw": {
      "m": 16,
      "ef": 200,
      "efConstruction": 200
    },
    "encryption": {
      "enabled": false,
      "algorithm": "aes-256-gcm"
    }
  },
}
```

### Configuration by Use Case

<details>
<summary><strong>Development Configuration</strong></summary>

```json
{
  "version": "3.0.0",
  "memory": { "type": "sqlite", "path": "./dev-data" },
  "swarm": { "topology": "mesh", "maxAgents": 5 },
  "security": { "mode": "permissive" }
}
```
</details>

<details>
<summary><strong>Production Configuration</strong></summary>

```json
{
  "version": "3.0.0",
  "memory": {
    "type": "hybrid",
    "path": "/var/lib/ruflo/data",
    "encryption": { "enabled": true, "algorithm": "aes-256-gcm" }
  },
  "swarm": { "topology": "hierarchical", "maxAgents": 15 }
}
```
</details>

<details>
<summary><strong>CI/CD Configuration</strong></summary>

```json
{
  "version": "3.0.0",
  "memory": { "type": "sqlite", "path": ":memory:" },
  "swarm": { "topology": "mesh", "maxAgents": 3 },
  "security": { "mode": "strict" }
}
```
</details>

<details>
<summary><strong>Memory-Constrained Configuration</strong></summary>

```json
{
  "version": "3.0.0",
  "memory": {
    "type": "sqlite",
    "maxEntries": 1000,
    "hnsw": { "m": 8, "ef": 100 }
  },
  "swarm": { "maxAgents": 3 }
}
```
</details>

### Breaking Changes

| Change | V2 | V3 | Impact |
|--------|----|----|--------|
| **Config Format** | `.ruflo/config.json` | `claude-flow.config.json` | Update path |

### Configuration Migration

**V3 Config (`claude-flow.config.json`)**:
```json
{
  "version": "3.0.0",
  "memory": {
    "type": "hybrid",
    "path": "./data",
    "hnsw": { "m": 16, "ef": 200 }
  },
  "swarm": {
    "topology": "hierarchical",
    "maxAgents": 15,
    "strategy": "specialized"
  }
}
```

### Common Migration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Config not found` | Path change | Rename to `claude-flow.config.json` |
