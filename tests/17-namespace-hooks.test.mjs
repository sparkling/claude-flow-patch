import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Find patched npx cache ──────────────────────────────────────────────────

function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const cliBase = join(nm, '@claude-flow', 'cli', 'dist', 'src');
    const memTools = join(cliBase, 'mcp-tools', 'memory-tools.js');
    if (existsSync(memTools)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ── Read target files once at module level ──────────────────────────────────

let memoryToolsSrc = '';
let embToolsSrc = '';
let hooksToolsSrc = '';
let cliMemorySrc = '';
let memInitSrc = '';
let helpersGenSrc = '';

if (canRun) {
  try { memoryToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'memory-tools.js'), 'utf-8'); } catch {}
  try { embToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'embeddings-tools.js'), 'utf-8'); } catch {}
  try { hooksToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8'); } catch {}
  try { cliMemorySrc = readFileSync(join(cliBase, 'commands', 'memory.js'), 'utf-8'); } catch {}
  try { memInitSrc = readFileSync(join(cliBase, 'memory', 'memory-initializer.js'), 'utf-8'); } catch {}
  try { helpersGenSrc = readFileSync(join(cliBase, 'init', 'helpers-generator.js'), 'utf-8'); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: NS-001 — Discovery ops default to 'all' namespace
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: NS-001 discovery ops namespace defaults', { skip: skipMsg }, () => {
  it('NS-001a: MCP search defaults namespace to all', () => {
    assert.ok(
      memoryToolsSrc.includes("input.namespace || 'all'"),
      'memory-tools.js should default search namespace to "all"',
    );
  });

  it('NS-001b: MCP list defaults namespace to all', () => {
    assert.ok(
      memoryToolsSrc.includes("all namespaces") || memoryToolsSrc.includes('all" = all namespaces'),
      'memory-tools.js list description should reference "all namespaces"',
    );
  });

  it('NS-001c: embeddings search defaults namespace to all', () => {
    assert.ok(
      embToolsSrc.includes("namespace || 'all'"),
      'embeddings-tools.js should default namespace to "all"',
    );
  });

  it('NS-001d: nsFilter variable used in listEntries', () => {
    assert.ok(
      memInitSrc.includes('nsFilter'),
      'memory-initializer.js should contain nsFilter variable for list queries',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: NS-002 — Store/delete/retrieve namespace strictness
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: NS-002 store/delete/retrieve namespace strictness', { skip: skipMsg }, () => {
  it('NS-002a: MCP store handler has no fallback to default', () => {
    // After patch, the store handler sets `const namespace = input.namespace;`
    // (no `|| 'default'`). We check the store handler context specifically.
    // The patched code has: const namespace = input.namespace;\n            if (!namespace
    assert.ok(
      memoryToolsSrc.includes("Namespace is required"),
      'memory-tools.js store should throw when namespace is missing',
    );
  });

  it('NS-002b: namespace is required in MCP store schema', () => {
    assert.ok(
      memoryToolsSrc.includes("required: ['key', 'value', 'namespace']"),
      'memory-tools.js store schema should require namespace',
    );
  });

  it('NS-002c: throws on missing namespace in store', () => {
    assert.ok(
      memoryToolsSrc.includes('Namespace is required (cannot be "all")'),
      'memory-tools.js should contain error message for missing/all namespace',
    );
  });

  it('NS-002d: rejects "all" for store operations', () => {
    assert.ok(
      memoryToolsSrc.includes("namespace === 'all'"),
      'memory-tools.js should check for namespace === "all" rejection',
    );
  });

  it('NS-002e: CLI memory store has no default fallback', () => {
    // After patch, the CLI store checks: if (!namespace || namespace === 'all')
    assert.ok(
      cliMemorySrc.includes('Namespace is required (cannot be "all")'),
      'commands/memory.js should reject missing/all namespace for store/delete',
    );
  });

  it('NS-002f: namespace required in MCP retrieve schema', () => {
    assert.ok(
      memoryToolsSrc.includes("required: ['key', 'namespace']"),
      'memory-tools.js retrieve schema should require namespace',
    );
  });

  it('NS-002g: core storeEntry rejects missing namespace', () => {
    assert.ok(
      memInitSrc.includes('storeEntry: namespace is required'),
      'memory-initializer.js storeEntry should throw on missing namespace',
    );
  });

  it('NS-002h: core deleteEntry rejects missing namespace', () => {
    assert.ok(
      memInitSrc.includes('deleteEntry: namespace is required'),
      'memory-initializer.js deleteEntry should throw on missing namespace',
    );
  });

  it('NS-002i: core getEntry rejects missing namespace', () => {
    assert.ok(
      memInitSrc.includes('getEntry: namespace is required'),
      'memory-initializer.js getEntry should throw on missing namespace',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: NS-003 — Namespace typo fix ('pattern' -> 'patterns')
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: NS-003 namespace typo pattern vs patterns', { skip: skipMsg }, () => {
  it('NS-003a: uses plural "patterns" namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("|| 'patterns'"),
      'hooks-tools.js should use "patterns" (plural) as default namespace',
    );
  });

  it('NS-003b: no singular "pattern" as namespace default', () => {
    // The patch changes `|| 'pattern'` to `|| 'patterns'` — verify old form is gone.
    // Be careful: 'pattern' may appear in other contexts (variable names, descriptions).
    assert.ok(
      !hooksToolsSrc.includes("|| 'pattern';"),
      'hooks-tools.js should not have || \'pattern\'; (singular) as namespace default',
    );
  });

  it('NS-003c: description says "patterns" not "pattern"', () => {
    assert.ok(
      hooksToolsSrc.includes('default: patterns'),
      'hooks-tools.js description should say "default: patterns" (plural)',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-001 — post-edit hook file_path from stdin
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: HK-001 post-edit hook reads stdin', { skip: skipMsg }, () => {
  it('HK-001a: helpers-generator contains stdinData parsing', () => {
    assert.ok(
      helpersGenSrc.includes('stdinData'),
      'helpers-generator.js should contain stdinData variable for stdin JSON parsing',
    );
  });

  it('HK-001b: helpers-generator parses JSON from stdin', () => {
    assert.ok(
      helpersGenSrc.includes('JSON.parse'),
      'helpers-generator.js should parse stdin JSON',
    );
  });

  it('HK-001c: file_path extracted from stdinData.tool_input', () => {
    assert.ok(
      helpersGenSrc.includes('stdinData.tool_input'),
      'helpers-generator.js should read file_path from stdinData.tool_input',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-002 — MCP hook handlers persist data
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: HK-002 MCP hook handlers persist data', { skip: skipMsg }, () => {
  it('HK-002a: hooksPostEdit calls getRealStoreFunction', () => {
    assert.ok(
      hooksToolsSrc.includes('getRealStoreFunction'),
      'hooks-tools.js should contain getRealStoreFunction for real persistence',
    );
  });

  it('HK-002b: hooksPostEdit persists to edits namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'edits'"),
      'hooks-tools.js postEdit handler should persist to "edits" namespace',
    );
  });

  it('HK-002c: hooksPostCommand persists to commands namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'commands'"),
      'hooks-tools.js postCommand handler should persist to "commands" namespace',
    );
  });

  it('HK-002d: hooksPostTask persists to tasks namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'tasks'"),
      'hooks-tools.js postTask handler should persist to "tasks" namespace',
    );
  });

  it('HK-002e: no fake random duration in postTask', () => {
    assert.ok(
      !hooksToolsSrc.includes('Math.floor(Math.random() * 300) + 60'),
      'hooks-tools.js postTask should not contain fake random duration',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-003 — hooks_metrics reads real data
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: HK-003 hooks_metrics reads real data', { skip: skipMsg }, () => {
  it('HK-003a: reads sona-patterns.json', () => {
    assert.ok(
      hooksToolsSrc.includes('sona-patterns.json'),
      'hooks-tools.js metrics handler should read sona-patterns.json',
    );
  });

  it('HK-003b: reads intelligence.json', () => {
    assert.ok(
      hooksToolsSrc.includes('intelligence.json'),
      'hooks-tools.js metrics handler should read intelligence.json',
    );
  });

  it('HK-003c: no hardcoded total: 15 in metrics', () => {
    // The old hardcoded stub had `total: 15, successful: 12, failed: 3`
    assert.ok(
      !hooksToolsSrc.includes('total: 15'),
      'hooks-tools.js metrics should not contain hardcoded total: 15',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-004 — session-start reads daemon.autoStart
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: HK-004 session-start respects daemon.autoStart', { skip: skipMsg }, () => {
  it('HK-004a: reads autoStart from settings', () => {
    assert.ok(
      hooksToolsSrc.includes('autoStart'),
      'hooks-tools.js session-start should check autoStart setting',
    );
  });

  it('HK-004b: reads settings.json file', () => {
    assert.ok(
      hooksToolsSrc.includes('settings.json'),
      'hooks-tools.js session-start should read settings.json',
    );
  });

  it('HK-004c: checks claudeFlow.daemon.autoStart path', () => {
    assert.ok(
      hooksToolsSrc.includes('claudeFlow') && hooksToolsSrc.includes('daemon') && hooksToolsSrc.includes('autoStart'),
      'hooks-tools.js should traverse claudeFlow.daemon.autoStart path',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-005 — PID-file guard for daemon
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-hooks: HK-005 daemon PID-file guard', { skip: skipMsg }, () => {
  it('HK-005a: checks daemon.pid before starting', () => {
    assert.ok(
      hooksToolsSrc.includes('daemon.pid'),
      'hooks-tools.js should check for daemon.pid file',
    );
  });

  it('HK-005b: writes PID after daemon start', () => {
    assert.ok(
      hooksToolsSrc.includes('HK-005: Write PID'),
      'hooks-tools.js should write PID after successful daemon start',
    );
  });

  it('HK-005c: uses process.kill to check if PID is alive', () => {
    assert.ok(
      hooksToolsSrc.includes('process.kill('),
      'hooks-tools.js should use process.kill to verify PID liveness',
    );
  });

  it('HK-005d: skips daemon start when existing PID is alive', () => {
    assert.ok(
      hooksToolsSrc.includes('_skipDaemon'),
      'hooks-tools.js should skip daemon start when existing PID is alive',
    );
  });
});
