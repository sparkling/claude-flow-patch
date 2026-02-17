// fixture-factory.mjs — Creates isolated temp copies of fixture files for testing
import { cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_SRC = resolve(__dirname, '..', 'fixtures', 'cli', 'dist', 'src');

/** Copy the fixture tree into a fresh temp dir. Returns { base, cleanup }. */
export function createFixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'cfp-test-'));
  const base = join(dir, 'dist', 'src');
  cpSync(FIXTURES_SRC, base, { recursive: true });
  return {
    dir,
    base,
    cleanup() { rmSync(dir, { recursive: true, force: true }); },
  };
}

/**
 * Build a fake npm cache structure so patch-all.sh / check-patches.sh
 * can discover it via their HOME-based glob.
 */
export function makeNpmCacheStructure(homeDir) {
  const cacheBase = join(homeDir, '.npm', '_npx', 'test-hash', 'node_modules', '@claude-flow', 'cli');
  const srcDir = join(cacheBase, 'dist', 'src');
  mkdirSync(srcDir, { recursive: true });
  cpSync(FIXTURES_SRC, srcDir, { recursive: true });
  return srcDir;
}
