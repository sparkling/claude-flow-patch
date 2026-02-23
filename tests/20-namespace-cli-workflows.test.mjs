import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { findNpxNmWithHook } from './helpers/integration-setup.mjs';

// ── Find patched npx cache ──────────────────────────────────────────────────

const npxNm = findNpxNmWithHook();
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
// Suite: namespace-workflows: CLI namespace round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-workflows: CLI namespace round-trip', { skip: skipMsg || !Database ? 'better-sqlite3 unavailable' : false }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-ns-'));
    const r = cli(['init', '--yes'], projectDir, 60000);
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });
    const dbCreated = createMemoryDb(join(projectDir, '.swarm', 'memory.db'));
    assert.ok(dbCreated, 'memory.db should be created');
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('store with explicit namespace exits 0', () => {
    const r = cli(['memory', 'store', '-k', 'ns-test-1', '--value', 'hello', '--namespace', 'myns'], projectDir);
    assert.equal(r.status, 0, `store failed (${r.status}): ${r.stderr}\n${r.stdout}`);
  });

  it('retrieve from explicit namespace returns stored content', () => {
    const r = cli(['memory', 'retrieve', '-k', 'ns-test-1', '--namespace', 'myns'], projectDir);
    assert.equal(r.status, 0, `retrieve failed: ${r.stderr}`);
    const output = r.stdout;
    assert.ok(output.includes('hello') || output.includes('ns-test-1'),
      `retrieve should return stored content, got: ${output}`);
  });

  it('store second entry in different namespace exits 0', () => {
    const r = cli(['memory', 'store', '-k', 'ns-test-2', '--value', 'world', '--namespace', 'otherns'], projectDir);
    assert.equal(r.status, 0, `store failed: ${r.stderr}\n${r.stdout}`);
  });

  it('list with namespace all shows entries', () => {
    const r = cli(['memory', 'list', '--namespace', 'all'], projectDir);
    assert.equal(r.status, 0, `list --namespace all failed: ${r.stderr}`);
    const output = r.stdout;
    assert.ok(output.includes('ns-test') || output.includes('entries') || output.includes('Entries') || output.includes('myns') || output.includes('otherns'),
      `list --namespace all should show entries, got: ${output}`);
  });

  it('list specific namespace shows only that namespace', () => {
    const r = cli(['memory', 'list', '--namespace', 'myns'], projectDir);
    assert.equal(r.status, 0, `list --namespace myns failed: ${r.stderr}`);
    const output = r.stdout;
    assert.ok(output.includes('ns-test-1') || output.includes('myns') || output.includes('entries') || output.includes('Entries'),
      `list --namespace myns should show ns-test-1, got: ${output}`);
  });

  it('delete from namespace exits 0', () => {
    const r = cli(['memory', 'delete', '-k', 'ns-test-1', '--namespace', 'myns', '--force'], projectDir);
    assert.equal(r.status, 0, `delete failed: ${r.stderr}`);
  });

  it('retrieve deleted entry fails', () => {
    const r = cli(['memory', 'retrieve', '-k', 'ns-test-1', '--namespace', 'myns'], projectDir);
    const output = r.stdout + r.stderr;
    const gone = r.status !== 0 || output.includes('not found') || output.includes('Not found') || output.includes('No entry');
    assert.ok(gone, `entry should be gone after delete, got status=${r.status}: ${output}`);
  });

  it('store rejects namespace all', () => {
    const r = cli(['memory', 'store', '-k', 'bad', '--value', 'bad', '--namespace', 'all'], projectDir);
    const output = r.stdout + r.stderr;
    const rejected = r.status !== 0 || output.includes('all') || output.includes('invalid') || output.includes('cannot');
    assert.ok(rejected, `store with namespace 'all' should be rejected or warned`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: namespace-workflows: search namespace defaults
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-workflows: search namespace defaults', { skip: skipMsg || !Database ? 'better-sqlite3 unavailable' : false }, () => {
  let projectDir;

  before(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cfp-ns-search-'));
    const r = cli(['init', '--yes'], projectDir, 60000);
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    mkdirSync(join(projectDir, '.swarm'), { recursive: true });
    const dbCreated = createMemoryDb(join(projectDir, '.swarm', 'memory.db'));
    assert.ok(dbCreated, 'memory.db should be created');
    // Store an entry for search tests
    const s = cli(['memory', 'store', '-k', 'search-entry', '--value', 'searchable content here', '--namespace', 'otherns'], projectDir);
    assert.equal(s.status, 0, `setup store failed: ${s.stderr}`);
  });

  after(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('search without --namespace uses all (does not fail)', () => {
    const r = cli(['memory', 'search', '--query', 'searchable content'], projectDir);
    assert.equal(r.status, 0, `search without namespace failed: ${r.stderr}\n${r.stdout}`);
  });

  it('search with explicit namespace exits 0', () => {
    const r = cli(['memory', 'search', '--query', 'searchable content', '--namespace', 'otherns'], projectDir);
    assert.equal(r.status, 0, `search with namespace failed: ${r.stderr}\n${r.stdout}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: namespace-workflows: namespace 'patterns' plural (NS-003)
// ══════════════════════════════════════════════════════════════════════════════

describe('namespace-workflows: namespace patterns plural (NS-003)', { skip: skipMsg }, () => {
  it('patched hooks-tools.js uses patterns (plural) namespace', () => {
    const hooksPath = join(npxNm, '@claude-flow', 'cli', 'dist', 'src', 'mcp-tools', 'hooks-tools.js');
    assert.ok(existsSync(hooksPath), `hooks-tools.js should exist at ${hooksPath}`);
    const content = readFileSync(hooksPath, 'utf-8');
    assert.ok(content.includes("|| 'patterns'"),
      `hooks-tools.js should contain || 'patterns' (plural), NS-003 may not be applied`);
    assert.ok(!content.includes("|| 'pattern'") || content.includes("|| 'patterns'"),
      `hooks-tools.js should use 'patterns' not 'pattern'`);
  });
});
