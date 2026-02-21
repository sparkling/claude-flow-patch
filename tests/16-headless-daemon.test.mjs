import { describe, it, before } from 'node:test';
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
    const hwe = join(cliBase, 'services', 'headless-worker-executor.js');
    if (existsSync(hwe)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ══════════════════════════════════════════════════════════════════════════════
// Suite: HW (Headless Worker) sentinel checks
// ══════════════════════════════════════════════════════════════════════════════

describe('headless-daemon: HW sentinel checks', { skip: skipMsg }, () => {
  let hweContent;
  let wdContent;

  before(() => {
    hweContent = readFileSync(join(cliBase, 'services', 'headless-worker-executor.js'), 'utf-8');
    wdContent = readFileSync(join(cliBase, 'services', 'worker-daemon.js'), 'utf-8');
  });

  it('HW-001: stdin pipe set to ignore', () => {
    assert.ok(
      hweContent.includes("'ignore', 'pipe', 'pipe'"),
      'headless-worker-executor.js should use ignore for stdin (not pipe)',
    );
  });

  it('HW-002: failure check after headless executor', () => {
    assert.ok(
      wdContent.includes('result.success'),
      'worker-daemon.js should check result.success after headless execution',
    );
  });

  it('HW-003a: audit scheduling interval 30 min', () => {
    assert.ok(
      wdContent.includes('intervalMs: 30 * 60 * 1000'),
      'audit worker interval should be 30 minutes (not 10)',
    );
  });

  it('HW-003b: optimize scheduling interval 60 min', () => {
    assert.ok(
      wdContent.includes("type: 'optimize', intervalMs: 60 * 60 * 1000"),
      'optimize worker interval should be 60 minutes (not 15)',
    );
  });

  it('HW-003c: parseInterval for settings-driven schedules', () => {
    assert.ok(
      wdContent.includes('parseInterval'),
      'worker-daemon.js should contain parseInterval for user-configurable schedules',
    );
  });

  it('HW-003d: daemon.schedules merge from settings.json', () => {
    assert.ok(
      wdContent.includes('daemon?.schedules'),
      'worker-daemon.js should read daemon.schedules from settings.json',
    );
  });

  it('HW-004: worker timeout raised to 16 min', () => {
    assert.ok(
      wdContent.includes('16 * 60 * 1000'),
      'DEFAULT_WORKER_TIMEOUT_MS should be 16 minutes (not 5)',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: DM (Daemon Worker) sentinel checks — worker-daemon.js
// ══════════════════════════════════════════════════════════════════════════════

describe('headless-daemon: DM sentinel checks (worker-daemon.js)', { skip: skipMsg }, () => {
  let wdContent;

  before(() => {
    wdContent = readFileSync(join(cliBase, 'services', 'worker-daemon.js'), 'utf-8');
  });

  it('DM-001a: appendFileSync import in worker-daemon.js', () => {
    assert.ok(
      wdContent.includes('appendFileSync'),
      'worker-daemon.js should import appendFileSync (not use require)',
    );
  });

  it('DM-002: maxCpuLoad threshold raised from 2.0', () => {
    assert.ok(
      wdContent.includes('maxCpuLoad: 28.0'),
      'maxCpuLoad should be 28.0 (not 2.0) for multi-core servers',
    );
  });

  it('DM-003: macOS platform check for freemem', () => {
    assert.ok(
      wdContent.includes('darwin'),
      'worker-daemon.js should contain darwin platform check for macOS freemem workaround',
    );
  });

  it('DM-004: DEFAULT_WORKERS includes preload entry', () => {
    assert.ok(
      wdContent.includes("type: 'preload'"),
      'DEFAULT_WORKERS should include a preload worker entry',
    );
  });

  it('DM-004: preload worker calls loadEmbeddingModel', () => {
    assert.ok(
      wdContent.includes('loadEmbeddingModel'),
      'preload worker should call loadEmbeddingModel for real preloading',
    );
  });

  it('DM-005: consolidation worker calls applyTemporalDecay', () => {
    assert.ok(
      wdContent.includes('applyTemporalDecay'),
      'consolidation worker should call applyTemporalDecay for real consolidation',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: DM (Daemon Worker) sentinel checks — daemon.js
// ══════════════════════════════════════════════════════════════════════════════

describe('headless-daemon: DM sentinel checks (daemon.js)', { skip: skipMsg }, () => {
  let djContent;

  before(() => {
    djContent = readFileSync(join(cliBase, 'commands', 'daemon.js'), 'utf-8');
  });

  it('DM-001b: log path uses logs/ subdirectory', () => {
    assert.ok(
      djContent.includes("'logs'"),
      'daemon.js should write logs to a logs/ subdirectory (not state dir root)',
    );
  });

  it('DM-006a: daemon.log rotation block present', () => {
    assert.ok(
      djContent.includes('Rotate main daemon.log'),
      'daemon.js should contain daemon.log rotation logic',
    );
  });

  it('DM-006b: log rotation 50MB threshold', () => {
    assert.ok(
      djContent.includes('50 * 1024 * 1024'),
      'daemon.js should rotate logs at 50MB',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: DM (Daemon Worker) sentinel checks — headless-worker-executor.js
// ══════════════════════════════════════════════════════════════════════════════

describe('headless-daemon: DM sentinel checks (headless-worker-executor.js)', { skip: skipMsg }, () => {
  let hweContent;

  before(() => {
    hweContent = readFileSync(join(cliBase, 'services', 'headless-worker-executor.js'), 'utf-8');
  });

  it('DM-006c: cleanupOldLogs function defined', () => {
    assert.ok(
      hweContent.includes('cleanupOldLogs'),
      'headless-worker-executor.js should contain cleanupOldLogs method',
    );
  });

  it('DM-006d: maxAgeDays parameter for log cleanup', () => {
    assert.ok(
      hweContent.includes('maxAgeDays'),
      'cleanupOldLogs should accept maxAgeDays parameter',
    );
  });

  it('DM-006e: unlinkSync imported for log cleanup', () => {
    assert.ok(
      hweContent.includes('unlinkSync'),
      'headless-worker-executor.js should import unlinkSync for log cleanup',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: DM functional tests (content parsing — DEFAULT_WORKERS is not exported)
// ══════════════════════════════════════════════════════════════════════════════

describe('headless-daemon: DM functional (content parsing)', { skip: skipMsg }, () => {
  let wdContent;

  before(() => {
    wdContent = readFileSync(join(cliBase, 'services', 'worker-daemon.js'), 'utf-8');
  });

  it('DM-004: DEFAULT_WORKERS has >= 5 worker type entries', () => {
    // Count distinct type: '...' entries in the DEFAULT_WORKERS array
    const typeMatches = wdContent.match(/type:\s*'[a-z]+'/g);
    assert.ok(typeMatches, 'should find type entries in DEFAULT_WORKERS');
    // Deduplicate (some types may appear elsewhere in the file)
    const uniqueTypes = new Set(typeMatches.map(m => m.match(/'([^']+)'/)[1]));
    assert.ok(uniqueTypes.size >= 5,
      `DEFAULT_WORKERS should have >= 5 worker types, found ${uniqueTypes.size}: ${[...uniqueTypes].join(', ')}`);
  });

  it('DM-004: DEFAULT_WORKERS includes preload and consolidation types', () => {
    assert.ok(
      wdContent.includes("type: 'preload'"),
      'DEFAULT_WORKERS should include preload worker',
    );
    assert.ok(
      wdContent.includes("type: 'consolidate'"),
      'DEFAULT_WORKERS should include consolidation worker',
    );
  });

  it('HW-003: audit/optimize/testgaps intervals are >= 30 min', () => {
    // HW-003 only patches audit (30m), optimize (60m), testgaps (60m)
    // Other workers like preload (10m) are intentionally shorter
    const thirtyMin = 30 * 60 * 1000;
    for (const workerType of ['audit', 'optimize', 'testgaps']) {
      const re = new RegExp(`type:\\s*'${workerType}'\\s*,\\s*intervalMs:\\s*([\\d*\\s]+)`);
      const m = wdContent.match(re);
      assert.ok(m, `Should find intervalMs for ${workerType} worker`);
      const iv = Function(`"use strict"; return (${m[1]})`)();
      assert.ok(iv >= thirtyMin,
        `Worker '${workerType}' intervalMs ${iv} should be >= 30 min (${thirtyMin})`);
    }
  });
});
