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
    const doc = join(cliBase, 'commands', 'doctor.js');
    if (existsSync(doc)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ── Find ruv-swarm package (may be in a different npx cache hash) ────────────

let ruvSwarmRoot = null;
{
  const npxDir = join(homedir(), '.npm', '_npx');
  if (existsSync(npxDir)) {
    for (const hash of readdirSync(npxDir)) {
      const rsPath = join(npxDir, hash, 'node_modules', 'ruv-swarm');
      if (existsSync(join(rsPath, 'package.json'))) { ruvSwarmRoot = rsPath; break; }
    }
  }
}
const noRuvSwarm = !ruvSwarmRoot ? 'ruv-swarm package not found' : false;

// ══════════════════════════════════════════════════════════════════════════════
// Suite: CF-001 — Doctor detects YAML config files
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: CF-001 doctor YAML config detection', { skip: skipMsg }, () => {
  let doctorContent;

  before(() => {
    doctorContent = readFileSync(join(cliBase, 'commands', 'doctor.js'), 'utf-8');
  });

  it('CF-001a: searches for config.yaml', () => {
    assert.ok(
      doctorContent.includes('config.yaml'),
      'doctor.js should search for config.yaml',
    );
  });

  it('CF-001b: searches for config.yml', () => {
    assert.ok(
      doctorContent.includes('config.yml'),
      'doctor.js should search for config.yml',
    );
  });

  it('CF-001c: skips JSON.parse for non-JSON files', () => {
    assert.ok(
      doctorContent.includes('.endsWith'),
      'doctor.js should check file extension before JSON.parse',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: CF-002 — Config export reads YAML
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: CF-002 config export reads YAML', { skip: skipMsg }, () => {
  let configContent;

  before(() => {
    configContent = readFileSync(join(cliBase, 'commands', 'config.js'), 'utf-8');
  });

  it('CF-002a: readYamlConfig helper exists', () => {
    assert.ok(
      configContent.includes('readYamlConfig'),
      'config.js should contain readYamlConfig helper',
    );
  });

  it('CF-002b: merges YAML over defaults', () => {
    assert.ok(
      configContent.includes('yamlConfig'),
      'config.js should reference yamlConfig for merge logic',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: CF-003 — Doctor --install native dependency resolution
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: CF-003 doctor native deps', { skip: skipMsg }, () => {
  let doctorContent;

  before(() => {
    doctorContent = readFileSync(join(cliBase, 'commands', 'doctor.js'), 'utf-8');
  });

  it('CF-003a: checkMemoryBackend diagnostic function exists', () => {
    assert.ok(
      doctorContent.includes('checkMemoryBackend'),
      'doctor.js should contain checkMemoryBackend function',
    );
  });

  it('CF-003b: checks for better-sqlite3', () => {
    assert.ok(
      doctorContent.includes('better-sqlite3'),
      'doctor.js should check for better-sqlite3 native bindings',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: MM-001 — Dead persistPath removed
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: MM-001 dead persistPath removed', { skip: skipMsg }, () => {
  let executorContent;

  before(() => {
    executorContent = readFileSync(join(cliBase, 'init', 'executor.js'), 'utf-8');
  });

  it('MM-001a: no persistPath in config.yaml template', () => {
    assert.ok(
      !executorContent.includes('persistPath: .claude-flow/data'),
      'executor.js should not contain persistPath: .claude-flow/data in config template',
    );
  });

  it('MM-001b: .swarm/ hardcoding used for data dir', () => {
    // The memory-initializer should use .swarm/ directly
    const miPath = join(cliBase, 'memory', 'memory-initializer.js');
    if (existsSync(miPath)) {
      const miContent = readFileSync(miPath, 'utf-8');
      assert.ok(
        miContent.includes('.swarm'),
        'memory-initializer.js should use .swarm/ for data directory',
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RS-001 — ruv-swarm better-sqlite3 version
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: RS-001 ruv-swarm better-sqlite3 version', { skip: skipMsg || noRuvSwarm }, () => {
  let pkgContent;

  before(() => {
    pkgContent = readFileSync(join(ruvSwarmRoot, 'package.json'), 'utf-8');
  });

  it('RS-001: better-sqlite3 bumped to ^12.0.0', () => {
    const pkg = JSON.parse(pkgContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    const bsqlVersion = deps['better-sqlite3'];
    assert.ok(bsqlVersion, 'ruv-swarm package.json should depend on better-sqlite3');
    assert.ok(
      bsqlVersion.includes('12'),
      `better-sqlite3 version should be ^12.x.x, got ${bsqlVersion}`,
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: UI-001 — intelligence stats null checks
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: UI-001 intelligence stats null checks', { skip: skipMsg }, () => {
  let hooksContent;

  before(() => {
    hooksContent = readFileSync(join(cliBase, 'commands', 'hooks.js'), 'utf-8');
  });

  it('UI-001a: learningTimeMs null guard', () => {
    assert.ok(
      hooksContent.includes('learningTimeMs != null'),
      'hooks.js should guard learningTimeMs with null check',
    );
  });

  it('UI-001b: toFixed with N/A fallback', () => {
    assert.ok(
      hooksContent.includes("'N/A'"),
      'hooks.js should use N/A fallback for null numeric metrics',
    );
  });

  it('UI-001c: performance section null guard', () => {
    assert.ok(
      hooksContent.includes('if (result.performance)'),
      'hooks.js should guard performance data section against null',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: UI-002 — neural status imports getHNSWIndex
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: UI-002 neural status imports getHNSWIndex', { skip: skipMsg }, () => {
  let neuralContent;

  before(() => {
    neuralContent = readFileSync(join(cliBase, 'commands', 'neural.js'), 'utf-8');
  });

  it('UI-002a: imports getHNSWIndex', () => {
    assert.ok(
      neuralContent.includes('getHNSWIndex'),
      'neural.js should import getHNSWIndex from memory-initializer',
    );
  });

  it('UI-002b: calls initializeTraining before status read', () => {
    assert.ok(
      neuralContent.includes('initializeTraining'),
      'neural.js should call initializeTraining() before reading status',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SG-001 — Init valid settings
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: SG-001 init generates valid settings', { skip: skipMsg }, () => {
  let settingsGenContent;

  before(() => {
    settingsGenContent = readFileSync(join(cliBase, 'init', 'settings-generator.js'), 'utf-8');
  });

  it('SG-001a: uses SubagentStop (not TeammateIdle)', () => {
    assert.ok(
      settingsGenContent.includes('hooks.SubagentStop'),
      'settings-generator.js should define SubagentStop hook',
    );
    assert.ok(
      !settingsGenContent.includes('hooks.TeammateIdle'),
      'settings-generator.js should not contain TeammateIdle (invalid hook event)',
    );
  });

  it('SG-001b: uses $CLAUDE_PROJECT_DIR for hook paths', () => {
    assert.ok(
      settingsGenContent.includes('CLAUDE_PROJECT_DIR'),
      'settings-generator.js should use $CLAUDE_PROJECT_DIR for hook command paths',
    );
  });

  it('SG-001c: statusLine gated on component', () => {
    assert.ok(
      settingsGenContent.includes('components.statusline && options.statusline.enabled'),
      'settings-generator.js should gate statusLine config on component being generated',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SG-003 — Init helpers for --dual, upgrade
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: SG-003 init helpers for --dual, upgrade', { skip: skipMsg }, () => {
  let initContent;
  let executorContent;
  let helpersGenContent;

  before(() => {
    initContent = readFileSync(join(cliBase, 'commands', 'init.js'), 'utf-8');
    executorContent = readFileSync(join(cliBase, 'init', 'executor.js'), 'utf-8');
    helpersGenContent = readFileSync(join(cliBase, 'init', 'helpers-generator.js'), 'utf-8');
  });

  it('SG-003a: --dual calls executeInit', () => {
    assert.ok(
      initContent.includes('executeInit'),
      'init.js should call executeInit in dual/parallel path',
    );
  });

  it('SG-003b: critical helpers generated when settings=true, helpers=false', () => {
    assert.ok(
      executorContent.includes('else if (options.components.settings)'),
      'executor.js should generate critical helpers when settings is true but helpers is false',
    );
  });

  it('SG-003c: hook-handler requires use .cjs extension', () => {
    assert.ok(
      helpersGenContent.includes('router.cjs'),
      'helpers-generator.js should reference router.cjs (not router.js)',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SG-004 — Wizard parity with init
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: SG-004 wizard parity with init', { skip: skipMsg }, () => {
  let initContent;
  let indexContent;

  before(() => {
    initContent = readFileSync(join(cliBase, 'commands', 'init.js'), 'utf-8');
    indexContent = readFileSync(join(cliBase, 'commands', 'index.js'), 'utf-8');
  });

  it('SG-004a: wizard command exported', () => {
    assert.ok(
      initContent.includes('export const wizardCommand') || initContent.includes('wizardCommand'),
      'init.js should export wizardCommand',
    );
  });

  it('SG-004b: wizardCommand registered in commands index', () => {
    assert.ok(
      indexContent.includes('wizardCommand'),
      'commands/index.js should reference wizardCommand',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SG-005 — 'start all' subcommand
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: SG-005 start all subcommand', { skip: skipMsg }, () => {
  let startContent;

  before(() => {
    startContent = readFileSync(join(cliBase, 'commands', 'start.js'), 'utf-8');
  });

  it('SG-005a: allCommand subcommand defined', () => {
    assert.ok(
      startContent.includes('allCommand'),
      'start.js should define allCommand subcommand',
    );
  });

  it('SG-005b: all subcommand starts daemon + agents', () => {
    assert.ok(
      startContent.includes('daemon start') && startContent.includes('memory init'),
      'start all should start daemon and initialize memory',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: SG-006 — Wizard captures permissionRequest hook
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: SG-006 wizard hook capture', { skip: skipMsg }, () => {
  let initContent;

  before(() => {
    initContent = readFileSync(join(cliBase, 'commands', 'init.js'), 'utf-8');
  });

  it('SG-006a: permissionRequest hook captured', () => {
    assert.ok(
      initContent.includes('permissionRequest'),
      'init.js should capture permissionRequest hook in wizard flow',
    );
  });

  it('SG-006b: wizard uses options.runtime.topology', () => {
    assert.ok(
      initContent.includes('options.runtime.topology'),
      'init.js wizard should use options.runtime.topology (not hardcoded hierarchical)',
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: CF-004 — Config export reads config.json
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: CF-004 config export reads config.json', { skip: skipMsg }, () => {
  let configContent;

  before(() => {
    configContent = readFileSync(join(cliBase, 'commands', 'config.js'), 'utf-8');
  });

  it('CF-004a: readYamlConfig references config.json', () => {
    assert.ok(
      configContent.includes('config.json'),
      'config.js readYamlConfig should reference config.json',
    );
  });

  it('CF-004b: duplicate readYamlConfig removed', () => {
    const matches = configContent.match(/function readYamlConfig/g) || [];
    assert.equal(matches.length, 1,
      `config.js should have exactly 1 readYamlConfig function, found ${matches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: WM-004 — Source hook config.json + fail-loud
// ══════════════════════════════════════════════════════════════════════════════

describe('config-ui-misc: WM-004 source hook config.json + fail-loud', { skip: skipMsg }, () => {
  let hookContent;
  const hookPath = join(cliBase, '..', '..', '.claude', 'helpers', 'auto-memory-hook.mjs');

  before(() => {
    hookContent = existsSync(hookPath) ? readFileSync(hookPath, 'utf-8') : '';
  });

  it('WM-004a: hook reads config.json', () => {
    assert.ok(
      hookContent.includes('config.json'),
      'auto-memory-hook.mjs should reference config.json (WM-004)',
    );
  });

  it('WM-004b: createBackend function in hook', () => {
    assert.ok(
      hookContent.includes('createBackend'),
      'auto-memory-hook.mjs should include createBackend function (WM-004)',
    );
  });

  it('WM-004c: fail-loud message references doctor --install', () => {
    assert.ok(
      hookContent.includes('doctor --install'),
      'auto-memory-hook.mjs should include doctor --install in fail-loud message (WM-004)',
    );
  });
});
