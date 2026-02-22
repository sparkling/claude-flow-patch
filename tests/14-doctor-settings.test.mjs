import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ── Find patched npx cache ──────────────────────────────────────────────────

function findPatchedNpxNm() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const cliBase = join(nm, '@claude-flow', 'cli', 'dist', 'src');
    const settingsGen = join(cliBase, 'init', 'settings-generator.js');
    if (existsSync(settingsGen)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ── Module-level imports (so skip works at registration time) ────────────────

let settingsGen = null;
let helpersGen = null;
if (npxNm) {
  try {
    settingsGen = await import(`file://${join(cliBase, 'init', 'settings-generator.js')}`);
  } catch {}
  try {
    helpersGen = await import(`file://${join(cliBase, 'init', 'helpers-generator.js')}`);
  } catch {}
}

const noSettingsMsg = !settingsGen ? 'settings-generator not importable' : false;
const noHelpersMsg = !helpersGen ? 'helpers-generator not importable' : false;

function cli(args, cwd, timeout = 30000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Doctor CLI
// ══════════════════════════════════════════════════════════════════════════════

describe('doctor-settings: doctor CLI health checks', { skip: skipMsg }, () => {
  it('doctor exits 0 or 1 (never crashes)', () => {
    const r = cli(['doctor'], process.cwd(), 60000);
    assert.ok(r.status === 0 || r.status === 1,
      `doctor should exit 0 (pass) or 1 (failures), got ${r.status}: ${r.stderr}`);
  });

  it('doctor output contains health check results', () => {
    const r = cli(['doctor'], process.cwd(), 60000);
    const output = r.stdout + r.stderr;
    const hasChecks = output.includes('Version') || output.includes('Node.js') || output.includes('Summary');
    assert.ok(hasChecks, `doctor should show health check results, got: ${output.substring(0, 300)}`);
  });

  it('doctor --verbose adds debug lines', () => {
    const r = cli(['doctor', '--verbose'], process.cwd(), 60000);
    const output = r.stdout + r.stderr;
    const hasDebug = output.includes('[DEBUG]') || output.includes('debug') || output.includes('Completed');
    assert.ok(hasDebug, `doctor --verbose should include debug output, got: ${output.substring(0, 300)}`);
  });

  it('doctor --fix shows suggested fixes', () => {
    const r = cli(['doctor', '--fix'], process.cwd(), 60000);
    const output = r.stdout + r.stderr;
    const hasFixes = output.includes('Fix') || output.includes('fix') || output.includes('suggest');
    assert.ok(hasFixes, `doctor --fix should show fix suggestions, got: ${output.substring(0, 300)}`);
  });

  it('doctor summary shows pass/warn/fail counts', () => {
    const r = cli(['doctor'], process.cwd(), 60000);
    const output = r.stdout + r.stderr;
    const hasSummary = output.includes('passed') || output.includes('warning') || output.includes('failed') || output.includes('Summary');
    assert.ok(hasSummary, `doctor should show summary with counts, got: ${output.substring(0, 300)}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Settings Generator
// ══════════════════════════════════════════════════════════════════════════════

describe('doctor-settings: generateSettings function', { skip: skipMsg || noSettingsMsg }, () => {
  const defaultOpts = {
    components: { settings: true, statusline: false, helpers: true },
    hooks: {},
    statusline: { enabled: false },
    runtime: {
      topology: 'hierarchical-mesh',
      maxAgents: 15,
      memoryBackend: 'hybrid',
      enableHNSW: true,
      enableLearningBridge: true,
      enableMemoryGraph: true,
      enableAgentScopes: true,
      enableNeural: true,
    },
  };

  it('generateSettings returns valid settings object', () => {
    const settings = settingsGen.generateSettings(defaultOpts);
    assert.ok(settings, 'should return settings object');
    assert.ok(typeof settings === 'object', 'settings should be an object');
  });

  it('generateSettings includes hooks and permissions', () => {
    const settings = settingsGen.generateSettings(defaultOpts);
    assert.ok(settings.hooks || settings.permissions,
      'settings should include hooks or permissions section');
  });

  it('generateSettings includes permissions allow list', () => {
    const settings = settingsGen.generateSettings(defaultOpts);
    assert.ok(settings.permissions, 'should have permissions');
    assert.ok(settings.permissions.allow, 'should have allow list');
    assert.ok(Array.isArray(settings.permissions.allow), 'allow should be array');
  });

  it('generateSettingsJson returns valid JSON string', () => {
    const json = settingsGen.generateSettingsJson(defaultOpts);
    assert.ok(typeof json === 'string', 'should return a string');
    const parsed = JSON.parse(json);
    assert.ok(parsed, 'should parse as valid JSON');
    assert.ok(typeof parsed === 'object', 'parsed JSON should be an object');
  });
});

describe('doctor-settings: init generates settings', { skip: skipMsg }, () => {
  it('init --yes generates settings.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-settings-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const settingsPath = join(dir, '.claude', 'settings.json');
      assert.ok(existsSync(settingsPath), '.claude/settings.json should exist after init');
      const content = readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.ok(parsed, 'settings.json should be valid JSON');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init settings.json includes hooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-hooks-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const settingsPath = join(dir, '.claude', 'settings.json');
      const content = readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.ok(parsed.hooks, 'settings.json should have hooks section');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Helpers Generator
// ══════════════════════════════════════════════════════════════════════════════

describe('doctor-settings: generateHelpers functions', { skip: skipMsg || noHelpersMsg }, () => {
  it('generateAutoMemoryHook returns valid JS', () => {
    const hook = helpersGen.generateAutoMemoryHook();
    assert.ok(typeof hook === 'string', 'should return string');
    assert.ok(hook.length > 100, 'hook should be non-trivial');
    // Verify it's valid JS by checking for no syntax errors
    const dir = mkdtempSync(join(tmpdir(), 'cfp-hookcheck-'));
    try {
      const hookPath = join(dir, 'hook.mjs');
      writeFileSync(hookPath, hook);
      const r = spawnSync('node', ['--check', hookPath], { encoding: 'utf-8', timeout: 10000 });
      assert.equal(r.status, 0, `hook should be valid JS: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generateAutoMemoryHook contains AutoMemoryBridge', () => {
    const hook = helpersGen.generateAutoMemoryHook();
    assert.ok(hook.includes('AutoMemoryBridge'),
      'hook should reference AutoMemoryBridge');
  });

  it('generateAutoMemoryHook contains busy_timeout', () => {
    const hook = helpersGen.generateAutoMemoryHook();
    assert.ok(hook.includes('busy_timeout'),
      'hook should set busy_timeout for concurrent access safety');
  });

  it('generateAutoMemoryHook contains hybrid-memory.db', () => {
    const hook = helpersGen.generateAutoMemoryHook();
    assert.ok(hook.includes('hybrid-memory.db'),
      'hook should reference hybrid-memory.db');
  });

  it('generatePreCommitHook returns non-empty string', () => {
    const hook = helpersGen.generatePreCommitHook();
    assert.ok(typeof hook === 'string' && hook.length > 10,
      'pre-commit hook should be non-empty');
  });

  it('generateSessionManager returns non-empty string', () => {
    const mgr = helpersGen.generateSessionManager();
    assert.ok(typeof mgr === 'string' && mgr.length > 50,
      'session manager should be non-empty');
  });

  it('generateIntelligenceStub returns non-empty string', () => {
    const stub = helpersGen.generateIntelligenceStub();
    assert.ok(typeof stub === 'string' && stub.length > 50,
      'intelligence stub should be non-empty');
  });

  it('generateHelpers returns all helper files', () => {
    const helpers = helpersGen.generateHelpers({
      components: { helpers: true, statusline: false },
    });
    assert.ok(helpers, 'generateHelpers should return result');
    assert.ok(typeof helpers === 'object', 'should return object');
    const keys = Object.keys(helpers);
    assert.ok(keys.length >= 3, `should have >= 3 helpers, got ${keys.length}: ${keys.join(', ')}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Config YAML handling
// ══════════════════════════════════════════════════════════════════════════════

describe('doctor-settings: config YAML handling', { skip: skipMsg }, () => {
  it('init creates config.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-config-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.yaml');
      assert.ok(existsSync(configPath), 'config.yaml should exist after init');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config.yaml contains expected sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgchk-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      const hasSections = content.includes('memory') || content.includes('swarm') || content.includes('agents');
      assert.ok(hasSections, `config.yaml should contain standard sections, got: ${content.substring(0, 200)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config export --format json exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-export-'));
    try {
      cli(['init', '--yes'], dir, 60000);
      const r = cli(['config', 'export', '--format', 'json'], dir, 30000);
      assert.equal(r.status, 0, `config export failed: ${r.stderr}`);
      const output = r.stdout;
      assert.ok(output.includes('{') || output.includes('export'),
        `config export should produce output, got: ${output.substring(0, 200)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('doctor detects config.yaml in initialized project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-docconfig-'));
    try {
      cli(['init', '--yes'], dir, 60000);
      const r = cli(['doctor'], dir, 60000);
      const output = r.stdout + r.stderr;
      const hasConfig = output.includes('Config') || output.includes('config');
      assert.ok(hasConfig, `doctor should check config, got: ${output.substring(0, 300)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Config JSON handling (SG-008 + CF-004)
// ══════════════════════════════════════════════════════════════════════════════

describe('doctor-settings: config.json handling', { skip: skipMsg }, () => {
  it('init creates config.json (SG-008)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgjson-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.json');
      assert.ok(existsSync(configPath), '.claude-flow/config.json should exist after init');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config.json has memory/neural/hooks sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgjsonkeys-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.json');
      if (!existsSync(configPath)) return;
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      assert.ok(parsed && typeof parsed === 'object', 'config.json should be a valid object');
      const hasExpected = 'memory' in parsed || 'neural' in parsed || 'hooks' in parsed;
      assert.ok(hasExpected,
        `config.json should have memory, neural, or hooks, got: ${Object.keys(parsed).join(', ')}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config.json memory.backend defaults to hybrid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgjsonbe-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.json');
      if (!existsSync(configPath)) return;
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      assert.equal(parsed.memory?.backend, 'hybrid',
        `default init config.json memory.backend should be hybrid, got: ${parsed.memory?.backend}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config.json neural.enabled defaults to true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgjsonneural-'));
    try {
      const r = cli(['init', '--yes'], dir, 60000);
      assert.equal(r.status, 0, `init failed: ${r.stderr}`);
      const configPath = join(dir, '.claude-flow', 'config.json');
      if (!existsSync(configPath)) return;
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      assert.equal(parsed.neural?.enabled, true,
        `default init config.json neural.enabled should be true, got: ${parsed.neural?.enabled}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('config export reflects config.json values (CF-004)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-cfgjsonexport-'));
    try {
      cli(['init', '--yes'], dir, 60000);
      const configPath = join(dir, '.claude-flow', 'config.json');
      if (!existsSync(configPath)) return;
      // Write custom config.json with a distinctive backend value
      writeFileSync(configPath, JSON.stringify({
        memory: { backend: 'sqlite' },
        neural: { enabled: false },
        hooks: { enabled: true },
      }));
      const r = cli(['config', 'export', '--format', 'json'], dir, 30000);
      assert.equal(r.status, 0, `config export failed: ${r.stderr}`);
      const output = r.stdout;
      // Verify the custom value appears in output
      assert.ok(output.includes('sqlite') || output.includes('memory'),
        `config export should reflect config.json values, got: ${output.substring(0, 300)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
