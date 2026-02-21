// fixture-factory.mjs — Creates isolated temp copies of fixture files for testing
import { cpSync, existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_SRC = resolve(__dirname, '..', 'fixtures', 'cli', 'dist', 'src');
const FIXTURES_HELPERS = resolve(__dirname, '..', 'fixtures', 'cli', '.claude', 'helpers');

/** Copy the fixture tree into a fresh temp dir. Returns { base, cleanup }. */
export function createFixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'cfp-test-'));
  const base = join(dir, 'dist', 'src');
  cpSync(FIXTURES_SRC, base, { recursive: true });
  // Also copy source helpers fixtures (.claude/helpers/) if they exist
  if (existsSync(FIXTURES_HELPERS)) {
    const helpersDir = join(dir, '.claude', 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    cpSync(FIXTURES_HELPERS, helpersDir, { recursive: true });
  }
  return {
    dir,
    base,
    cleanup() { rmSync(dir, { recursive: true, force: true }); },
  };
}

/**
 * Build a fake npm cache structure (direct layout) so patch-all.sh /
 * check-patches.sh can discover it via their HOME-based glob.
 * Layout: ~/.npm/_npx/{hash}/node_modules/@claude-flow/cli/dist/src/
 */
export function makeNpmCacheStructure(homeDir, hash = 'test-hash') {
  const cacheBase = join(homeDir, '.npm', '_npx', hash, 'node_modules', '@claude-flow', 'cli');
  const srcDir = join(cacheBase, 'dist', 'src');
  mkdirSync(srcDir, { recursive: true });
  cpSync(FIXTURES_SRC, srcDir, { recursive: true });
  // Write a minimal package.json so version detection works
  const pkgDir = join(cacheBase);
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@claude-flow/cli', version: '3.1.0-test' }));
  return srcDir;
}

/**
 * Build a fake umbrella npm cache structure.
 * Layout: ~/.npm/_npx/{hash}/node_modules/claude-flow/v3/@claude-flow/cli/dist/src/
 */
export function makeUmbrellaCacheStructure(homeDir, hash = 'umbrella-hash') {
  const umbrellaBase = join(homeDir, '.npm', '_npx', hash, 'node_modules', 'claude-flow', 'v3', '@claude-flow', 'cli');
  const srcDir = join(umbrellaBase, 'dist', 'src');
  mkdirSync(srcDir, { recursive: true });
  cpSync(FIXTURES_SRC, srcDir, { recursive: true });
  writeFileSync(join(umbrellaBase, 'package.json'), JSON.stringify({ name: '@claude-flow/cli', version: '3.1.0-umbrella-test' }));
  return srcDir;
}

/**
 * Build a fake global npm prefix structure (umbrella global install).
 * Layout: {prefix}/lib/node_modules/claude-flow/v3/@claude-flow/cli/dist/src/
 */
export function makeGlobalPrefixStructure(prefixDir) {
  const globalBase = join(prefixDir, 'lib', 'node_modules', 'claude-flow', 'v3', '@claude-flow', 'cli');
  const srcDir = join(globalBase, 'dist', 'src');
  mkdirSync(srcDir, { recursive: true });
  cpSync(FIXTURES_SRC, srcDir, { recursive: true });
  writeFileSync(join(globalBase, 'package.json'), JSON.stringify({ name: '@claude-flow/cli', version: '3.1.0-global-test' }));
  return srcDir;
}
