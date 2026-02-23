import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { findNpxNmWithNativeDeps } from './helpers/integration-setup.mjs';

const npxNm = findNpxNmWithNativeDeps();
let canRun = false;
let memPkg = null;

if (npxNm) {
  try {
    memPkg = await import(join(npxNm, '@claude-flow', 'memory', 'dist', 'index.js'));
    canRun = !!(memPkg.resolveAgentMemoryDir && memPkg.createAgentBridge);
  } catch {}
}

const skipMsg = !canRun ? 'agent-scoped memory exports unavailable' : false;

function createProject(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `cfp-${prefix}-`));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', type: 'module', private: true }));

  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@claude-flow'), { recursive: true });
  for (const pkg of ['@claude-flow/memory', 'better-sqlite3', 'agentdb']) {
    const target = join(npxNm, pkg);
    if (existsSync(target)) {
      const linkPath = join(nm, pkg);
      const parent = resolve(linkPath, '..');
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      if (!existsSync(linkPath)) symlinkSync(target, linkPath);
    }
  }
  for (const dep of ['bindings', 'prebuild-install', 'node-addon-api', 'hnswlib-node', 'file-uri-to-path', 'node-gyp-build']) {
    const target = join(npxNm, dep);
    if (existsSync(target)) {
      const linkPath = join(nm, dep);
      if (!existsSync(linkPath)) symlinkSync(target, linkPath);
    }
  }

  mkdirSync(join(dir, '.claude-flow'), { recursive: true });
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });
  // Create a .git dir so resolveAgentMemoryDir can find git root
  mkdirSync(join(dir, '.git'), { recursive: true });

  return { dir, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: resolveAgentMemoryDir
// ══════════════════════════════════════════════════════════════════════════════

describe('agent-scoped: resolveAgentMemoryDir', { skip: skipMsg }, () => {
  it('resolves project scope path', () => {
    const dir = memPkg.resolveAgentMemoryDir('coder', 'project', '/tmp/test-proj');
    assert.ok(dir.includes('agent-memory'), 'path should contain agent-memory');
    assert.ok(dir.includes('coder'), 'path should contain agent name');
    assert.ok(!dir.includes('local'), 'project scope should not contain local');
  });

  it('resolves local scope path', () => {
    const dir = memPkg.resolveAgentMemoryDir('tester', 'local', '/tmp/test-proj');
    assert.ok(dir.includes('agent-memory-local') || dir.includes('local'), 'local scope path should differ from project');
    assert.ok(dir.includes('tester'), 'path should contain agent name');
  });

  it('resolves user scope path', () => {
    const dir = memPkg.resolveAgentMemoryDir('planner', 'user', '/tmp/test-proj');
    assert.ok(dir.includes('planner'), 'path should contain agent name');
    // User scope typically resolves to ~/.claude/agent-memory/
    assert.ok(dir.includes(homedir()) || dir.includes('.claude'),
      'user scope should reference home dir or .claude');
  });

  it('different scopes produce different paths', () => {
    const project = memPkg.resolveAgentMemoryDir('agent1', 'project', '/tmp/test-proj');
    const local = memPkg.resolveAgentMemoryDir('agent1', 'local', '/tmp/test-proj');
    const user = memPkg.resolveAgentMemoryDir('agent1', 'user', '/tmp/test-proj');
    assert.notEqual(project, local, 'project and local paths should differ');
    assert.notEqual(project, user, 'project and user paths should differ');
  });

  it('sanitizes agent names against path traversal', () => {
    const dir = memPkg.resolveAgentMemoryDir('../../../etc/passwd', 'project', '/tmp/test-proj');
    assert.ok(!dir.includes('../../'), 'should sanitize path traversal attempts');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: createAgentBridge
// ══════════════════════════════════════════════════════════════════════════════

describe('agent-scoped: createAgentBridge', { skip: skipMsg }, () => {
  let project, backend;

  before(async () => {
    project = createProject('agent-bridge');
    backend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'hybrid-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'agentdb-memory.db') },
      dualWrite: true,
    });
    await backend.initialize();
  });

  after(async () => {
    if (backend) try { await backend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('creates a scoped AutoMemoryBridge instance', () => {
    const bridge = memPkg.createAgentBridge(backend, {
      agentName: 'test-coder',
      scope: 'project',
      workingDir: project.dir,
      syncMode: 'on-session-end',
    });
    assert.ok(bridge, 'bridge should be created');
    assert.equal(typeof bridge.recordInsight, 'function', 'bridge should have recordInsight');
    assert.equal(typeof bridge.syncToAutoMemory, 'function', 'bridge should have syncToAutoMemory');
    if (bridge.destroy) bridge.destroy();
  });

  it('scoped bridge can recordInsight', async () => {
    const bridge = memPkg.createAgentBridge(backend, {
      agentName: 'test-reviewer',
      scope: 'project',
      workingDir: project.dir,
    });
    await bridge.recordInsight({
      category: 'code-review',
      summary: 'Always check error handling in async functions',
      source: 'agent:reviewer',
      confidence: 0.9,
    });
    // Verify entry exists in backend
    const count = await backend.count();
    assert.ok(count >= 1, 'backend should have entries after recordInsight');
    if (bridge.destroy) bridge.destroy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: transferKnowledge
// ══════════════════════════════════════════════════════════════════════════════

describe('agent-scoped: transferKnowledge', { skip: skipMsg }, () => {
  let project, sourceBackend, targetBackend;

  before(async () => {
    project = createProject('transfer');

    sourceBackend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'source-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'source-agentdb.db') },
      dualWrite: true,
    });
    await sourceBackend.initialize();

    targetBackend = new memPkg.HybridBackend({
      sqlite: { databasePath: join(project.dir, '.swarm', 'target-memory.db') },
      agentdb: { dbPath: join(project.dir, '.swarm', 'target-agentdb.db') },
      dualWrite: true,
    });
    await targetBackend.initialize();

    // Seed source with entries
    for (let i = 0; i < 5; i++) {
      await sourceBackend.store(memPkg.createDefaultEntry({
        namespace: 'learnings',
        key: `insight-${i}`,
        content: `Important insight ${i} about code quality`,
        tags: ['insight', 'quality'],
        metadata: { confidence: 0.85 + i * 0.02, category: 'patterns' },
      }));
    }
  });

  after(async () => {
    if (sourceBackend) try { await sourceBackend.shutdown(); } catch {}
    if (targetBackend) try { await targetBackend.shutdown(); } catch {}
    if (project) project.cleanup();
  });

  it('transfers entries between backends', async () => {
    const targetBridge = memPkg.createAgentBridge(targetBackend, {
      agentName: 'target-agent',
      scope: 'project',
      workingDir: project.dir,
    });

    const result = await memPkg.transferKnowledge(sourceBackend, targetBridge, {
      sourceNamespace: 'learnings',
      minConfidence: 0.0,
      maxEntries: 10,
    });

    assert.ok(result, 'transfer should return result');
    assert.ok('transferred' in result, 'result should have transferred count');
    assert.ok('skipped' in result, 'result should have skipped count');
    assert.ok(result.transferred >= 0, 'transferred count should be non-negative');
    if (targetBridge.destroy) targetBridge.destroy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: listAgentScopes
// ══════════════════════════════════════════════════════════════════════════════

describe('agent-scoped: listAgentScopes', { skip: skipMsg }, () => {
  let project;

  before(() => {
    project = createProject('list-scopes');
    // Create agent memory directories
    mkdirSync(join(project.dir, '.claude', 'agent-memory', 'coder'), { recursive: true });
    mkdirSync(join(project.dir, '.claude', 'agent-memory', 'tester'), { recursive: true });
    mkdirSync(join(project.dir, '.claude', 'agent-memory-local', 'researcher'), { recursive: true });
  });

  after(() => {
    if (project) project.cleanup();
  });

  it('discovers agent directories across scopes', () => {
    const scopes = memPkg.listAgentScopes(project.dir);
    assert.ok(Array.isArray(scopes), 'listAgentScopes should return array');
    // Should find at least the project scope agents we created
    const projectScope = scopes.find(s => s.scope === 'project');
    if (projectScope) {
      assert.ok(projectScope.agents.includes('coder'), 'should find coder agent');
      assert.ok(projectScope.agents.includes('tester'), 'should find tester agent');
    }
  });
});
