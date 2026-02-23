// integration-setup.mjs — Shared setup/teardown for integration tests
// Creates a temporary project with symlinked deps from the npx cache.
// Searches both direct and umbrella npx layouts:
//   direct:   nm/@claude-flow/cli/dist/src
//   umbrella: nm/claude-flow/v3/@claude-flow/cli/dist/src
import {
  existsSync, mkdtempSync, mkdirSync, rmSync,
  symlinkSync, writeFileSync, readdirSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';

// Both layouts for @claude-flow/cli inside a node_modules dir
const CLI_LAYOUTS = [
  ['direct',   '@claude-flow/cli/dist/src'],
  ['umbrella', 'claude-flow/v3/@claude-flow/cli/dist/src'],
];

/**
 * Given a node_modules dir, return the cliBase (dist/src) path if the CLI
 * is installed in either layout, or null.
 */
export function findCliBase(npxNm) {
  for (const [, rel] of CLI_LAYOUTS) {
    const candidate = join(npxNm, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Enumerate ALL @claude-flow/cli installs across every npx cache hash.
 * Returns [{ cliBase, npxNodeModules, layout, hash }] — may be empty.
 */
export function findAllCliInstalls() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return [];

  const results = [];
  const seen = new Set();

  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    if (!existsSync(nm)) continue;

    for (const [layout, rel] of CLI_LAYOUTS) {
      const candidate = join(nm, rel);
      if (!existsSync(candidate)) continue;
      // Deduplicate by realpath
      let real;
      try { real = resolve(candidate); } catch { real = candidate; }
      if (seen.has(real)) continue;
      seen.add(real);
      results.push({ cliBase: candidate, npxNodeModules: nm, layout, hash });
    }
  }
  return results;
}

/**
 * Find the first npxNm (node_modules) that has @claude-flow/memory + better-sqlite3.
 * Searches both direct and umbrella layouts.
 */
export function findNpxNmWithNativeDeps() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const memPkg = join(nm, '@claude-flow', 'memory', 'dist', 'index.js');
    const bsql = join(nm, 'better-sqlite3');
    if (existsSync(memPkg) && existsSync(bsql)) return nm;
  }
  return null;
}

/**
 * Find the first npxNm that has auto-memory-hook.mjs + better-sqlite3.
 * Searches both direct and umbrella layouts.
 */
export function findNpxNmWithHook() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  for (const hash of readdirSync(npxDir)) {
    const nm = join(npxDir, hash, 'node_modules');
    const bsql = join(nm, 'better-sqlite3');
    if (!existsSync(bsql)) continue;
    // Check hook in both layouts
    for (const [, rel] of CLI_LAYOUTS) {
      const hookPath = join(nm, rel, '..', '..', '.claude', 'helpers', 'auto-memory-hook.mjs');
      if (existsSync(hookPath)) return nm;
    }
  }
  return null;
}

/**
 * Find the first npxNm where dist/src/{relPath} exists.
 * Prefers direct layout over umbrella to maintain backward compatibility
 * (direct installs have all peripheral files like .claude/helpers/).
 * @param {string} relPath - path relative to dist/src/ (e.g. 'init/settings-generator.js')
 */
export function findNpxNmWithCliFile(relPath) {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;
  const hashes = readdirSync(npxDir);
  // Prefer direct layout: scan all hashes for direct first, then umbrella
  for (const [, rel] of CLI_LAYOUTS) {
    for (const hash of hashes) {
      const nm = join(npxDir, hash, 'node_modules');
      const target = join(nm, rel, relPath);
      if (existsSync(target)) return nm;
    }
  }
  return null;
}

/**
 * Find the patched npx cache install of @claude-flow/cli.
 * Returns { cliBase, npxNodeModules } or null.
 * Searches both direct and umbrella layouts, preferring direct.
 */
export function findPatchedInstall() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;

  const hashes = readdirSync(npxDir);
  // Prefer direct layout over umbrella
  for (const [, rel] of CLI_LAYOUTS) {
    for (const hash of hashes) {
      const nm = join(npxDir, hash, 'node_modules');
      const cliBase = join(nm, rel);
      if (!existsSync(cliBase)) continue;

      // Check sentinel: memory-initializer.js means patches are applied
      const miPath = join(cliBase, 'memory', 'memory-initializer.js');
      if (!existsSync(miPath)) continue;

      return { cliBase, npxNodeModules: nm };
    }
  }
  return null;
}

/**
 * Check if native deps (better-sqlite3, @claude-flow/memory) are available
 * in the npx cache. Returns true if a functional HybridBackend can be created.
 */
export function checkNativeDeps() {
  const install = findPatchedInstall();
  if (!install) return false;

  const { npxNodeModules } = install;
  try {
    const memPkg = require(join(npxNodeModules, '@claude-flow', 'memory', 'dist', 'index.js'));
    if (!memPkg.HybridBackend) return false;

    // Check better-sqlite3 is loadable
    require(join(npxNodeModules, 'better-sqlite3'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a temporary project directory with symlinked deps from the npx cache.
 *
 * Returns { dir, cliBase, npxNodeModules, cleanup } or throws if install not found.
 */
export function createTestProject() {
  const install = findPatchedInstall();
  if (!install) {
    throw new Error('No patched @claude-flow/cli install found in npx cache');
  }

  const { cliBase, npxNodeModules } = install;
  const dir = mkdtempSync(join(tmpdir(), 'cfp-integ-'));

  // package.json for ESM resolution
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'cfp-integration-test',
    type: 'module',
    private: true,
  }));

  // Symlink deps into node_modules
  const nm = join(dir, 'node_modules');
  mkdirSync(join(nm, '@claude-flow'), { recursive: true });

  const symlinks = [
    ['@claude-flow/memory', join(npxNodeModules, '@claude-flow', 'memory')],
    ['better-sqlite3', join(npxNodeModules, 'better-sqlite3')],
    ['agentdb', join(npxNodeModules, 'agentdb')],
  ];

  for (const [name, target] of symlinks) {
    if (existsSync(target)) {
      const linkPath = join(nm, name);
      // Ensure parent dir exists for scoped packages
      const parent = resolve(linkPath, '..');
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      symlinkSync(target, linkPath);
    }
  }

  // Also symlink transitive native deps if hoisted
  const transitiveDeps = [
    'bindings', 'prebuild-install', 'node-addon-api',
    'hnswlib-node', '@xenova/transformers',
  ];
  for (const dep of transitiveDeps) {
    const target = join(npxNodeModules, dep);
    if (existsSync(target)) {
      const linkPath = join(nm, dep);
      const parent = resolve(linkPath, '..');
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      if (!existsSync(linkPath)) {
        symlinkSync(target, linkPath);
      }
    }
  }

  // Create project directories
  mkdirSync(join(dir, '.claude-flow'), { recursive: true });
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'helpers'), { recursive: true });

  // Write config.yaml
  writeFileSync(join(dir, '.claude-flow', 'config.yaml'), [
    'memory:',
    '  backend: hybrid',
    '',
    'neural:',
    '  enabled: true',
    '',
  ].join('\n'));

  return {
    dir,
    cliBase,
    npxNodeModules,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
