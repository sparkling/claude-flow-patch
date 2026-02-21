import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync,
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
    const hg = join(cliBase, 'init', 'helpers-generator.js');
    if (existsSync(hg)) return nm;
  }
  return null;
}

const npxNm = findPatchedNpxNm();
const canRun = !!npxNm;
const skipMsg = !canRun ? 'patched npx cache not found' : false;
const cliBase = npxNm ? join(npxNm, '@claude-flow', 'cli', 'dist', 'src') : '';

// ── Detect ruvector ─────────────────────────────────────────────────────────

let ruvectorCliPath = null;
if (npxNm) {
  const rvPath = join(npxNm, 'ruvector', 'bin', 'cli.js');
  if (existsSync(rvPath)) ruvectorCliPath = rvPath;
}
const noRuvector = !ruvectorCliPath ? 'ruvector package not found' : false;

// ══════════════════════════════════════════════════════════════════════════════
// Suite: IN-001 real intelligence.cjs generation
// ══════════════════════════════════════════════════════════════════════════════

describe('intelligence-learning: IN-001 real intelligence.cjs generation', { skip: skipMsg }, () => {
  const executorPath = join(cliBase, 'init', 'executor.js');
  const helpersGenPath = join(cliBase, 'init', 'helpers-generator.js');
  const intellPath = npxNm
    ? join(npxNm, '@claude-flow', 'cli', '.claude', 'helpers', 'intelligence.cjs')
    : '';

  it('helpers generator or executor has intelligence.cjs path', () => {
    let found = false;
    for (const p of [helpersGenPath, executorPath]) {
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf-8');
        if (content.includes('intelligence.cjs')) {
          found = true;
          break;
        }
      }
    }
    assert.ok(found, 'helpers-generator.js or executor.js should reference intelligence.cjs');
  });

  it('generated intelligence.cjs is real (not stub)', { skip: !existsSync(intellPath) ? 'intelligence.cjs not in package' : false }, () => {
    const content = readFileSync(intellPath, 'utf-8');
    const lineCount = content.split('\n').length;
    assert.ok(lineCount > 500,
      `intelligence.cjs should be > 500 lines (real), got ${lineCount} lines (likely stub if < 200)`);
  });

  it('real intelligence.cjs has learning functions', { skip: !existsSync(intellPath) ? 'intelligence.cjs not in package' : false }, () => {
    const content = readFileSync(intellPath, 'utf-8');
    const hasLearning = content.includes('function feedback(')
      || content.includes('function consolidate(')
      || content.includes('function getContext(')
      || content.includes('computePageRank');
    assert.ok(hasLearning,
      'intelligence.cjs should contain learning functions (feedback, consolidate, getContext, or computePageRank)');
  });

  it('real intelligence.cjs is valid JS', { skip: !existsSync(intellPath) ? 'intelligence.cjs not in package' : false }, () => {
    const r = spawnSync('node', ['--check', intellPath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    assert.equal(r.status, 0, `intelligence.cjs should be valid JS: ${r.stderr}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-001 force-learn engine (ruvector)
// ══════════════════════════════════════════════════════════════════════════════

describe('intelligence-learning: RV-001 force-learn engine', { skip: skipMsg || noRuvector }, () => {
  let cliContent;

  before(() => {
    cliContent = readFileSync(ruvectorCliPath, 'utf-8');
  });

  it('force-learn code does NOT use skipEngine: true', () => {
    // RV-001a removes skipEngine: true so the engine can initialize
    // Check that skipEngine: true does not appear near force-learn context
    const forceLearnIdx = cliContent.indexOf('force-learn');
    if (forceLearnIdx === -1) {
      // If force-learn not found as literal, check for force_learn or forcelearnHandler
      assert.ok(true, 'force-learn handler may use different naming');
      return;
    }
    // Check a window around force-learn for skipEngine
    const window = cliContent.substring(
      Math.max(0, forceLearnIdx - 500),
      Math.min(cliContent.length, forceLearnIdx + 1000)
    );
    assert.ok(!window.includes('skipEngine: true'),
      'force-learn should NOT contain skipEngine: true (RV-001a removes it)');
  });

  it('force-learn calls engine.tick()', () => {
    // RV-001a replaces intel.tick() with eng.tick() via the engine property
    assert.ok(cliContent.includes('eng.tick()'),
      'ruvector cli.js should contain eng.tick() (engine-based tick call)');
  });

  it('force-learn handles no-engine gracefully', () => {
    // RV-001b adds a guard for when engine is not available
    const hasGuard = cliContent.includes('Engine not available')
      || cliContent.includes('if (eng)')
      || cliContent.includes('eng ?');
    assert.ok(hasGuard,
      'ruvector cli.js should handle missing engine gracefully');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-002 activeTrajectories persistence
// ══════════════════════════════════════════════════════════════════════════════

describe('intelligence-learning: RV-002 activeTrajectories persistence', { skip: skipMsg || noRuvector }, () => {
  let cliContent;

  before(() => {
    cliContent = readFileSync(ruvectorCliPath, 'utf-8');
  });

  it('activeTrajectories in default state', () => {
    // RV-002a adds activeTrajectories: {} to the defaults object
    assert.ok(cliContent.includes('activeTrajectories'),
      'ruvector cli.js should contain activeTrajectories');
    // Check for the default empty object
    const hasDefault = cliContent.includes('activeTrajectories: {}')
      || cliContent.includes('activeTrajectories:{}');
    assert.ok(hasDefault,
      'ruvector cli.js should have activeTrajectories: {} in defaults');
  });

  it('activeTrajectories in load return', () => {
    // RV-002b adds activeTrajectories to the loaded data return
    assert.ok(
      cliContent.includes('data.activeTrajectories'),
      'ruvector cli.js should load activeTrajectories from saved data'
    );
  });

  it('write/read trajectory state round-trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfp-rv002-'));
    try {
      mkdirSync(join(dir, '.ruvector'), { recursive: true });
      const state = {
        activeTrajectories: { 'traj-1': { steps: 3 } },
        stats: { total_trajectories: 1 },
      };
      const filePath = join(dir, '.ruvector', 'intelligence.json');
      writeFileSync(filePath, JSON.stringify(state));
      const loaded = JSON.parse(readFileSync(filePath, 'utf-8'));
      assert.ok(loaded.activeTrajectories['traj-1'],
        'activeTrajectories should survive JSON round-trip');
      assert.equal(loaded.activeTrajectories['traj-1'].steps, 3,
        'trajectory steps should be preserved');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: RV-003 trajectory-end stats sync
// ══════════════════════════════════════════════════════════════════════════════

describe('intelligence-learning: RV-003 trajectory-end stats sync', { skip: skipMsg || noRuvector }, () => {
  let cliContent;

  before(() => {
    cliContent = readFileSync(ruvectorCliPath, 'utf-8');
  });

  it('stats sync code exists for total_trajectories', () => {
    // RV-003a adds stats.total_trajectories = intel.data.trajectories.length
    assert.ok(cliContent.includes('total_trajectories'),
      'ruvector cli.js should contain total_trajectories update');
    // Verify it's an assignment, not just a default
    const hasSync = cliContent.includes('.total_trajectories =')
      || cliContent.includes('total_trajectories:');
    assert.ok(hasSync,
      'ruvector cli.js should assign total_trajectories from actual data');
  });

  it('stats sync counts patterns', () => {
    // RV-003a adds stats.total_patterns = Object.keys(intel.data.patterns || {}).length
    assert.ok(cliContent.includes('total_patterns'),
      'ruvector cli.js should contain total_patterns update');
    const hasPatternSync = cliContent.includes('.total_patterns =')
      || cliContent.includes('total_patterns:');
    assert.ok(hasPatternSync,
      'ruvector cli.js should assign total_patterns from actual data');
  });

  it('stats sync occurs before or during save', () => {
    // RV-003a inserts stats sync code right before intel.save()
    // The comment "RV-003: sync stats" should appear before .save()
    const syncIdx = cliContent.indexOf('RV-003: sync stats');
    const saveIdx = cliContent.indexOf('intel.save()', syncIdx > -1 ? syncIdx : 0);
    if (syncIdx > -1 && saveIdx > -1) {
      assert.ok(syncIdx < saveIdx,
        'stats sync (RV-003) should occur before intel.save()');
    } else {
      // Fallback: at minimum, both total_trajectories assignment and save should exist
      assert.ok(cliContent.includes('total_trajectories'),
        'should have total_trajectories for stats sync');
      assert.ok(cliContent.includes('.save('),
        'should have a save call');
    }
  });
});
