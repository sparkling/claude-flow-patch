import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  makeNpmCacheStructure,
  makeUmbrellaCacheStructure,
} from './helpers/fixture-factory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DISCOVER_SH = resolve(ROOT, 'lib', 'discover.sh');
const FIXTURES_SRC = resolve(__dirname, 'fixtures', 'cli', 'dist', 'src');

/**
 * Run discover.sh functions in isolation with a fake HOME.
 * The wrapper script sources discover.sh and calls the given function.
 */
function runDiscover(fakeHome, funcCall, extraEnv = {}) {
  const script = `
    export HOME="${fakeHome}"
    # Override npm prefix to a nonexistent dir so global-prefix probe doesn't find real installs
    npm() { if [[ "$1" == "config" && "$2" == "get" && "$3" == "prefix" ]]; then echo "/tmp/fake-npm-prefix-$$"; return 0; fi; command npm "$@"; }
    export -f npm
    . "${DISCOVER_SH}"
    ${funcCall}
  `;
  const r = spawnSync('bash', ['-c', script], {
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...process.env, ...extraEnv, HOME: fakeHome },
  });
  return {
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    status: r.status ?? 1,
    lines: (r.stdout || '').trim().split('\n').filter(Boolean),
  };
}

function parseLine(line) {
  const [dist_src, version, rv_cli, rs_root, writable] = line.split('\t');
  // "-" is the placeholder for empty fields (bash IFS collapses consecutive tabs)
  return {
    dist_src,
    version,
    rv_cli: rv_cli === '-' ? '' : rv_cli,
    rs_root: rs_root === '-' ? '' : rs_root,
    writable,
  };
}

describe('lib/discover.sh', () => {
  let fakeHome;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'cfp-discover-'));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  describe('discover_all_cf_installs', () => {
    it('finds direct npx cache install', () => {
      makeNpmCacheStructure(fakeHome, 'direct-hash');
      const r = runDiscover(fakeHome, 'discover_all_cf_installs');
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.lines.length, 1, `expected 1 install, got ${r.lines.length}: ${r.stdout}`);

      const parsed = parseLine(r.lines[0]);
      assert.ok(parsed.dist_src.includes('direct-hash'), 'should include hash in path');
      assert.ok(parsed.dist_src.includes('@claude-flow/cli/dist/src'), 'should include standard path');
      assert.equal(parsed.version, '3.1.0-test');
      assert.equal(parsed.writable, 'yes');
    });

    it('finds umbrella npx cache install', () => {
      makeUmbrellaCacheStructure(fakeHome, 'umbrella-hash');
      const r = runDiscover(fakeHome, 'discover_all_cf_installs');
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.lines.length, 1, `expected 1 install, got ${r.lines.length}: ${r.stdout}`);

      const parsed = parseLine(r.lines[0]);
      assert.ok(parsed.dist_src.includes('claude-flow/v3/@claude-flow/cli'), 'should include umbrella path');
      assert.equal(parsed.version, '3.1.0-umbrella-test');
    });

    it('finds both direct and umbrella installs', () => {
      makeNpmCacheStructure(fakeHome, 'hash-a');
      makeUmbrellaCacheStructure(fakeHome, 'hash-b');
      const r = runDiscover(fakeHome, 'discover_all_cf_installs');
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.lines.length, 2, `expected 2 installs, got ${r.lines.length}: ${r.stdout}`);
    });

    it('deduplicates identical installs (same realpath)', () => {
      makeNpmCacheStructure(fakeHome, 'only-one');
      const r = runDiscover(fakeHome, 'discover_all_cf_installs');
      assert.equal(r.lines.length, 1);
    });

    it('returns empty when no installs found', () => {
      const r = runDiscover(fakeHome, 'discover_all_cf_installs');
      assert.equal(r.status, 0);
      assert.equal(r.lines.length, 0, `expected 0 installs, got: ${r.stdout}`);
    });
  });

  describe('discover_target_installs', () => {
    it('finds direct layout in target dir', () => {
      const projectDir = join(fakeHome, 'project');
      const nmDir = join(projectDir, 'node_modules', '@claude-flow', 'cli');
      const srcDir = join(nmDir, 'dist', 'src');
      mkdirSync(srcDir, { recursive: true });
      cpSync(FIXTURES_SRC, srcDir, { recursive: true });
      writeFileSync(join(nmDir, 'package.json'), JSON.stringify({ name: '@claude-flow/cli', version: '3.1.0-target' }));

      const r = runDiscover(fakeHome, `discover_target_installs "${projectDir}"`);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.lines.length, 1);
      const parsed = parseLine(r.lines[0]);
      assert.equal(parsed.version, '3.1.0-target');
    });

    it('finds umbrella layout in target dir', () => {
      const projectDir = join(fakeHome, 'project2');
      const nmDir = join(projectDir, 'node_modules', 'claude-flow', 'v3', '@claude-flow', 'cli');
      const srcDir = join(nmDir, 'dist', 'src');
      mkdirSync(srcDir, { recursive: true });
      cpSync(FIXTURES_SRC, srcDir, { recursive: true });
      writeFileSync(join(nmDir, 'package.json'), JSON.stringify({ name: '@claude-flow/cli', version: '3.1.0-umb-target' }));

      const r = runDiscover(fakeHome, `discover_target_installs "${projectDir}"`);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.equal(r.lines.length, 1);
      const parsed = parseLine(r.lines[0]);
      assert.equal(parsed.version, '3.1.0-umb-target');
    });

    it('returns empty for nonexistent target', () => {
      const r = runDiscover(fakeHome, 'discover_target_installs "/tmp/no-such-dir-cfp-test"');
      assert.equal(r.status, 0);
      assert.equal(r.lines.length, 0);
    });
  });

  describe('_cfp_npx_cache_roots', () => {
    it('returns ~/.npm/_npx when it exists', () => {
      mkdirSync(join(fakeHome, '.npm', '_npx'), { recursive: true });
      const r = runDiscover(fakeHome, '_cfp_npx_cache_roots');
      assert.equal(r.status, 0);
      assert.ok(r.lines.length >= 1);
      assert.ok(r.lines[0].endsWith('.npm/_npx'));
    });

    it('returns empty when ~/.npm/_npx does not exist', () => {
      const r = runDiscover(fakeHome, '_cfp_npx_cache_roots');
      assert.equal(r.status, 0);
      assert.equal(r.lines.length, 0);
    });
  });
});
