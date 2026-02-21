import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync, symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ── Find patched npx cache ──────────────────────────────────────────────────

function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const cliBase = join(nm, '@claude-flow', 'cli', 'dist', 'src');
    const hg = join(cliBase, 'init', 'helpers-generator.js');
    if (existsSync(hg)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ── Module-level imports ────────────────────────────────────────────────────

let helpersGen = null;
if (npxNm) {
  try {
    helpersGen = await import(`file://${join(cliBase, 'init', 'helpers-generator.js')}`);
  } catch {}
}

const noHelpersMsg = !helpersGen ? 'helpers-generator not importable' : false;

// Read hooks-tools.js source for sentinel checks
let hooksToolsSrc = '';
if (canRun) {
  try { hooksToolsSrc = readFileSync(join(cliBase, 'mcp-tools', 'hooks-tools.js'), 'utf-8'); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-001 — post-edit hook file_path from stdin (e2e)
// ══════════════════════════════════════════════════════════════════════════════

describe('hook-persistence: HK-001 file_path from stdin', { skip: skipMsg || noHelpersMsg }, () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfp-hk001-'));
  });

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('generateHookHandler returns non-empty string', () => {
    const code = helpersGen.generateHookHandler();
    assert.ok(typeof code === 'string', 'should return string');
    assert.ok(code.length > 100, 'hook handler should be non-trivial');
  });

  it('hook handler is valid JS', () => {
    const code = helpersGen.generateHookHandler();
    const hookPath = join(dir, 'hook-handler.cjs');
    writeFileSync(hookPath, code);
    const r = spawnSync('node', ['--check', hookPath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(r.status, 0, `hook should be valid JS: ${r.stderr}`);
  });

  it('post-edit with stdin JSON extracts file_path (not "unknown")', () => {
    const code = helpersGen.generateHookHandler();
    const hookPath = join(dir, 'hook-handler-run.cjs');
    writeFileSync(hookPath, code);

    // Create a minimal .ruvector directory so intelligence.cjs (if loaded) doesn't crash
    mkdirSync(join(dir, '.ruvector'), { recursive: true });

    const r = spawnSync('node', [hookPath, 'post-edit'], {
      encoding: 'utf-8',
      input: JSON.stringify({ file_path: '/src/test.js', tool_input: { file_path: '/src/test.js' } }),
      timeout: 10000,
      cwd: dir,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    const output = (r.stdout || '') + (r.stderr || '');
    // The hook should either reference the file path or at least not say "unknown"
    const saysUnknown = output.includes('file: "unknown"') || output.includes("file: 'unknown'");
    assert.ok(!saysUnknown, `post-edit should not report file as "unknown", got: ${output.substring(0, 500)}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-002 — handlers persist data (generated code inspection)
// ══════════════════════════════════════════════════════════════════════════════

describe('hook-persistence: HK-002 handlers persist data', { skip: skipMsg || noHelpersMsg }, () => {
  it('generated hook handler has stdinData parsing for post-edit persistence', () => {
    const code = helpersGen.generateHookHandler();
    assert.ok(
      code.includes('stdinData') || code.includes('stdin'),
      'generated hook handler should parse stdin data for edit persistence',
    );
  });

  it('generated hook handler has pre-bash command validation', () => {
    const code = helpersGen.generateHookHandler();
    assert.ok(
      code.includes('pre-bash'),
      'generated hook handler should handle pre-bash command validation',
    );
  });

  it('generated hook handler has post-task handling', () => {
    const code = helpersGen.generateHookHandler();
    assert.ok(
      code.includes('post-task') || code.includes('postTask'),
      'generated hook handler should handle post-task events',
    );
  });

  it('MCP hooks-tools.js persists edits to "edits" namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'edits'"),
      'hooks-tools.js should persist edits to "edits" namespace',
    );
  });

  it('MCP hooks-tools.js persists commands to "commands" namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'commands'"),
      'hooks-tools.js should persist commands to "commands" namespace',
    );
  });

  it('MCP hooks-tools.js persists tasks to "tasks" namespace', () => {
    assert.ok(
      hooksToolsSrc.includes("namespace: 'tasks'"),
      'hooks-tools.js should persist tasks to "tasks" namespace',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HK-003 — metrics from real data
// ══════════════════════════════════════════════════════════════════════════════

describe('hook-persistence: HK-003 metrics from real data', { skip: skipMsg }, () => {
  it('hooks-tools.js reads sona-patterns.json for metrics', () => {
    assert.ok(
      hooksToolsSrc.includes('sona-patterns.json'),
      'hooks-tools.js metrics should read from sona-patterns.json',
    );
  });

  it('no hardcoded total:15 in hooks-tools.js metrics', () => {
    assert.ok(
      !hooksToolsSrc.includes('total: 15'),
      'hooks-tools.js should not contain hardcoded total: 15',
    );
  });

  it('hooks-tools.js reads intelligence.json for command stats', () => {
    assert.ok(
      hooksToolsSrc.includes('intelligence.json'),
      'hooks-tools.js metrics should read intelligence.json for command stats',
    );
  });

  it('metrics handler has HK-003 patch marker', () => {
    assert.ok(
      hooksToolsSrc.includes('HK-003'),
      'hooks-tools.js should contain HK-003 patch comment',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: auto-memory-hook round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe('hook-persistence: auto-memory-hook round-trip', { skip: skipMsg || noHelpersMsg }, () => {
  let projectDir;

  function symlinkDeps() {
    const nm = join(projectDir, 'node_modules');
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
  }

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-hk-amh-'));
    // Generate and write the auto-memory hook
    const hookCode = helpersGen.generateAutoMemoryHook();
    const helpersDir = join(projectDir, '.claude', 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    writeFileSync(join(helpersDir, 'auto-memory-hook.mjs'), hookCode);
    // Create .swarm directory for database files
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });
    // Symlink native dependencies
    symlinkDeps();
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('generated auto-memory-hook contains AutoMemoryBridge', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const content = readFileSync(hookPath, 'utf-8');
    assert.ok(content.includes('AutoMemoryBridge'), 'hook should reference AutoMemoryBridge');
  });

  it('hook status exits 0', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'status'], {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook status failed (status=${r.status}): ${r.stderr}`);
  });

  it('hook status shows Active', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'status'], {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: projectDir,
    });
    const output = r.stdout || '';
    assert.ok(
      output.includes('Active'),
      `hook status should show "Active", got: ${output.substring(0, 300)}`,
    );
  });

  it('hook import exits 0', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'import'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook import failed (status=${r.status}): ${r.stderr}`);
  });

  it('hook sync exits 0', () => {
    const hookPath = join(projectDir, '.claude', 'helpers', 'auto-memory-hook.mjs');
    const r = spawnSync('node', [hookPath, 'sync'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: projectDir,
    });
    assert.equal(r.status, 0, `hook sync failed (status=${r.status}): ${r.stderr}`);
  });
});
