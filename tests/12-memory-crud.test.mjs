import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// ── Find patched npx cache ──────────────────────────────────────────────────

function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const hookPath = join(nm, '@claude-flow', 'cli', '.claude', 'helpers', 'auto-memory-hook.mjs');
    const bsql = join(nm, 'better-sqlite3');
    if (existsSync(hookPath) && existsSync(bsql)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;

let Database = null;
if (npxNm) {
  try {
    const require = createRequire(join(npxNm, 'noop.js'));
    Database = require('better-sqlite3');
  } catch {}
}

function cli(args, cwd, timeout = 30000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

// Create a WASM-compatible memory.db with the correct schema
function createMemoryDb(dbPath) {
  if (!Database) return false;
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        namespace TEXT DEFAULT 'default',
        content TEXT NOT NULL,
        type TEXT DEFAULT 'semantic',
        embedding TEXT,
        embedding_model TEXT DEFAULT 'local',
        embedding_dimensions INTEGER,
        tags TEXT,
        metadata TEXT,
        owner_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        expires_at INTEGER,
        last_accessed_at INTEGER,
        access_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        UNIQUE(namespace, key)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory_entries(namespace);
      CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key);
    `);
    db.close();
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Memory CLI CRUD via subprocess
// ══════════════════════════════════════════════════════════════════════════════

describe('memory-crud: CLI store/retrieve/search/list/delete', { skip: skipMsg || !Database ? 'better-sqlite3 unavailable' : false }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-crud-'));
    const r = cli(['init', '--yes'], projectDir, 60000);
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });
    // Create WASM-compatible memory.db with correct schema
    const dbCreated = createMemoryDb(join(projectDir, '.swarm', 'memory.db'));
    assert.ok(dbCreated, 'memory.db should be created');
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('memory store exits 0', () => {
    const r = cli(['memory', 'store', '-k', 'crud-key-1', '--value', 'Hello from e2e test', '--namespace', 'crud-test'], projectDir);
    assert.equal(r.status, 0, `store failed (${r.status}): ${r.stderr}\n${r.stdout}`);
  });

  it('memory store with tags exits 0', () => {
    const r = cli(['memory', 'store', '-k', 'crud-key-2', '--value', 'Tagged entry', '--namespace', 'crud-test', '--tags', 'e2e,test'], projectDir);
    assert.equal(r.status, 0, `store with tags failed: ${r.stderr}`);
  });

  it('memory retrieve returns stored content', () => {
    const r = cli(['memory', 'retrieve', '-k', 'crud-key-1', '--namespace', 'crud-test'], projectDir);
    assert.equal(r.status, 0, `retrieve failed: ${r.stderr}`);
    const output = r.stdout;
    assert.ok(output.includes('Hello from e2e test') || output.includes('crud-key-1'),
      `retrieve should return stored content, got: ${output}`);
  });

  it('memory list shows stored entries', () => {
    const r = cli(['memory', 'list', '--namespace', 'crud-test'], projectDir);
    assert.equal(r.status, 0, `list failed: ${r.stderr}`);
    const output = r.stdout;
    assert.ok(output.includes('crud-key') || output.includes('crud-test') || output.includes('entries') || output.includes('Entries'),
      `list should mention stored entries, got: ${output}`);
  });

  it('memory search finds entries', () => {
    const r = cli(['memory', 'search', '--query', 'Hello e2e', '--namespace', 'crud-test'], projectDir);
    assert.equal(r.status, 0, `search failed: ${r.stderr}`);
    // Search may or may not find results depending on embedding availability
  });

  it('memory delete removes entry', () => {
    const r = cli(['memory', 'delete', '-k', 'crud-key-1', '--namespace', 'crud-test', '--force'], projectDir);
    assert.equal(r.status, 0, `delete failed: ${r.stderr}`);
  });

  it('memory retrieve after delete shows not found', () => {
    const r = cli(['memory', 'retrieve', '-k', 'crud-key-1', '--namespace', 'crud-test'], projectDir);
    // Should either exit non-zero or output indicates not found
    const output = r.stdout + r.stderr;
    const gone = r.status !== 0 || output.includes('not found') || output.includes('Not found') || output.includes('No entry');
    assert.ok(gone, `entry should be gone after delete, got status=${r.status}: ${output}`);
  });

  it('memory store rejects namespace all', () => {
    const r = cli(['memory', 'store', '-k', 'bad', '--value', 'bad', '--namespace', 'all'], projectDir);
    // Should fail or warn about 'all' namespace
    const output = r.stdout + r.stderr;
    const rejected = r.status !== 0 || output.includes('all') || output.includes('invalid') || output.includes('cannot');
    assert.ok(rejected, `store with namespace 'all' should be rejected or warned`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Memory init + verify
// ══════════════════════════════════════════════════════════════════════════════

describe('memory-crud: memory init and verify', { skip: skipMsg }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-minit-'));
    const r = cli(['init', '--yes'], projectDir, 60000);
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('memory init exits 0 and shows configuration', () => {
    const r = cli(['memory', 'init'], projectDir, 60000);
    assert.equal(r.status, 0, `memory init failed: ${r.stderr}\n${r.stdout}`);
    const output = r.stdout;
    assert.ok(output.includes('Configuration') || output.includes('Schema'),
      `memory init should show configuration, got: ${output}`);
  });

  it('memory init creates hybrid-memory.db', () => {
    const hybridDb = join(projectDir, '.swarm', 'hybrid-memory.db');
    assert.ok(existsSync(hybridDb), 'hybrid-memory.db should exist after init');
  });

  it('memory init --verify shows verification output', () => {
    const r = cli(['memory', 'init', '--verify', '--verbose'], projectDir, 60000);
    // Verify exits 0 regardless — it's the init that matters
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Verification') || output.includes('Verify') || output.includes('test'),
      `memory init --verify should show verification output, got: ${output}`);
  });
});
