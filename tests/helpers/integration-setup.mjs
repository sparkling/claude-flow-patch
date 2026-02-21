// integration-setup.mjs — Shared setup/teardown for integration tests
// Creates a temporary project with symlinked deps from the npx cache.
import {
  existsSync, mkdtempSync, mkdirSync, rmSync,
  symlinkSync, writeFileSync, readdirSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Find the patched npx cache install of @claude-flow/cli.
 * Returns { cliBase, npxNodeModules } or null.
 */
export function findPatchedInstall() {
  const npxDir = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxDir)) return null;

  for (const hash of readdirSync(npxDir)) {
    const cliBase = join(npxDir, hash, 'node_modules', '@claude-flow', 'cli', 'dist', 'src');
    if (!existsSync(cliBase)) continue;

    // Check sentinel: HybridBackend in memory-initializer.js means patches are applied
    const miPath = join(cliBase, 'memory', 'memory-initializer.js');
    if (!existsSync(miPath)) continue;

    const npxNodeModules = join(npxDir, hash, 'node_modules');
    return { cliBase, npxNodeModules };
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
