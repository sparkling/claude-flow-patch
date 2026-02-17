#!/usr/bin/env node
// scripts/upstream-log.mjs — Show recent @claude-flow/cli releases with changes.
//
// Usage:
//   node scripts/upstream-log.mjs [count]    # default: 10
//   node scripts/upstream-log.mjs 20         # last 20 releases
//   node scripts/upstream-log.mjs --diff     # also diff deps against our baseline
//
// Requires: npm, gh (optional, for commit messages)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Args ──

const args = process.argv.slice(2).filter(a => a !== '--diff');
const showDiff = process.argv.includes('--diff');
const count = parseInt(args[0], 10) || 10;

// ── Baseline (installed) + latest from npm ──

// Detect installed version from npx cache
let baseline = null;
try {
  const pkgPath = run("find ~/.npm/_npx -path '*/@claude-flow/cli/package.json' -type f 2>/dev/null | head -1");
  if (pkgPath) {
    const installed = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    baseline = installed.version ?? null;
  }
} catch { /* not installed */ }

const latest = run('npm view @claude-flow/cli@latest version').trim() || null;

// ── Helpers ──

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch {
    return '';
  }
}

// ── Fetch npm version timeline ──

const timeJson = run('npm view @claude-flow/cli time --json');
if (!timeJson) {
  console.error('ERROR: Could not fetch version data from npm.');
  process.exit(1);
}

const times = JSON.parse(timeJson);
delete times.created;
delete times.modified;

// Sort by publish date descending, take last N (+1 for window boundary)
const allVersions = Object.entries(times)
  .sort((a, b) => new Date(b[1]) - new Date(a[1]));

const versions = allVersions.slice(0, count);

// ── Fetch GitHub commits with timestamps ──

const commits = []; // { time: Date, msg: string }

function fetchCommits() {
  const raw = run(
    'gh api repos/ruvnet/claude-flow/commits?per_page=100 ' +
    "--jq '.[] | \"\\(.commit.author.date)\\t\\(.commit.message | split(\"\\n\")[0])\"'"
  );
  if (!raw) return;
  for (const line of raw.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const time = new Date(line.slice(0, tab));
    const msg = line.slice(tab + 1);
    if (!isNaN(time.getTime()) && msg) {
      commits.push({ time, msg });
    }
  }
  // Sort oldest first for window matching
  commits.sort((a, b) => a.time - b.time);
}

fetchCommits();

/**
 * Find commits between prevTime (exclusive) and thisTime (inclusive).
 * Skip version-bump-only commits.
 */
function commitsForWindow(thisTime, prevTime) {
  const start = prevTime ? new Date(prevTime) : new Date(0);
  const end = new Date(thisTime);
  return commits
    .filter(c => c.time > start && c.time <= end)
    .filter(c => !/^Bump to 3\.\d/.test(c.msg))
    .filter(c => !/^Checkpoint:/.test(c.msg))
    .map(c => c.msg);
}

// ── Dep diff helper ──

function getDeps(version) {
  const raw = run(`npm view @claude-flow/cli@${version} dependencies --json`);
  return raw ? JSON.parse(raw) : {};
}

// ── Output ──

console.log(`Last ${versions.length} releases of @claude-flow/cli`);
if (latest) console.log(`Latest on npm: ${latest}`);
if (baseline) console.log(`Patch baseline: ${baseline}`);
if (latest && baseline && latest !== baseline) {
  const ahead = allVersions.findIndex(([v]) => v === baseline) - allVersions.findIndex(([v]) => v === latest);
  if (ahead > 0) console.log(`Upstream is ${ahead} version${ahead > 1 ? 's' : ''} ahead of baseline`);
}
console.log('');

for (let i = 0; i < versions.length; i++) {
  const [version, time] = versions[i];
  const date = time.slice(0, 10);
  const isBaseline = version === baseline;
  const marker = isBaseline ? '  <-- patch baseline' : '';

  console.log(`  ${version}  ${date}${marker}`);

  // Previous version's time is the window boundary
  const prevTime = versions[i + 1]?.[1] ?? allVersions[allVersions.indexOf(versions[i]) + 1]?.[1];
  const windowCommits = commitsForWindow(time, prevTime);

  for (const msg of windowCommits.slice(0, 5)) {
    console.log(`    - ${msg}`);
  }
  if (windowCommits.length > 5) {
    console.log(`    ... and ${windowCommits.length - 5} more`);
  }
  if (windowCommits.length === 0 && commits.length > 0) {
    console.log('    (version bump only)');
  }
}

// ── Dep diff against baseline ──

if (showDiff && baseline) {
  const latest = versions[0]?.[0];
  if (latest && latest !== baseline) {
    console.log('');
    console.log(`Dependency diff: ${baseline} -> ${latest}`);
    console.log('');

    const oldDeps = getDeps(baseline);
    const newDeps = getDeps(latest);

    const allKeys = new Set([...Object.keys(oldDeps), ...Object.keys(newDeps)]);
    let anyChange = false;

    for (const key of [...allKeys].sort()) {
      const oldV = oldDeps[key];
      const newV = newDeps[key];
      if (oldV !== newV) {
        anyChange = true;
        if (!oldV) console.log(`  + ${key}: ${newV}`);
        else if (!newV) console.log(`  - ${key}: ${oldV}`);
        else console.log(`  ~ ${key}: ${oldV} -> ${newV}`);
      }
    }

    if (!anyChange) console.log('  (no dependency changes)');
  }
}

console.log('');
