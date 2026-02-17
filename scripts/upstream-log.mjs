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

// ── Helpers ──

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch {
    return '';
  }
}

// ── Our baseline + latest from npm ──

let baseline = null;
try {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');
  const match = readme.match(/@claude-flow\/cli.*?\*\*v?(3\.\d+\.\d+-alpha\.\d+)\*\*/);
  baseline = match?.[1] ?? null;
} catch { /* no README */ }

const latest = run('npm view @claude-flow/cli@latest version') || null;

// ── Fetch npm version timeline ──

const timeJson = run('npm view @claude-flow/cli time --json');
if (!timeJson) {
  console.error('ERROR: Could not fetch version data from npm.');
  process.exit(1);
}

const times = JSON.parse(timeJson);
delete times.created;
delete times.modified;

// Sort by publish date descending
const allVersions = Object.entries(times)
  .sort((a, b) => new Date(b[1]) - new Date(a[1]));

const versions = allVersions.slice(0, count);

// ── Fetch GitHub commits with full messages ──
// Uses NUL byte as record separator to handle multi-line messages.

const commits = []; // { time: Date, subject: string, body: string[] }

function fetchCommits() {
  // Fetch full message with NUL-delimited records
  const raw = run(
    "gh api repos/ruvnet/claude-flow/commits?per_page=100 " +
    "--jq '.[] | \"\\(.commit.author.date)\\u0000\\(.commit.message)\\u0000\"'"
  );
  if (!raw) return;

  // Split on NUL pairs (each record is: date NUL message NUL)
  const records = raw.split('\0');
  for (let i = 0; i < records.length - 1; i += 2) {
    const dateStr = records[i].replace(/\n$/, '').replace(/^\n/, '');
    const message = records[i + 1] || '';
    const time = new Date(dateStr);
    if (isNaN(time.getTime())) continue;

    const lines = message.split('\n');
    const subject = lines[0] || '';
    // Body: skip empty line after subject, collect non-empty lines
    const body = lines.slice(1)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('Co-Authored-By:'));

    commits.push({ time, subject, body });
  }

  commits.sort((a, b) => a.time - b.time);
}

fetchCommits();

/**
 * Find commits between prevTime (exclusive) and thisTime (inclusive).
 * Skip version bumps and checkpoint commits.
 */
function commitsForWindow(thisTime, prevTime) {
  const start = prevTime ? new Date(prevTime) : new Date(0);
  const end = new Date(thisTime);
  return commits
    .filter(c => c.time > start && c.time <= end)
    .filter(c => !/^Bump to 3\.\d/.test(c.subject))
    .filter(c => !/^Checkpoint:/.test(c.subject));
}

/** Shorten "3.1.0-alpha.42" to "alpha.42" */
function shortVersion(v) {
  const m = v.match(/alpha\.(\d+)$/);
  return m ? `alpha.${m[1]}` : v;
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
  const latestIdx = allVersions.findIndex(([v]) => v === latest);
  const baseIdx = allVersions.findIndex(([v]) => v === baseline);
  const ahead = baseIdx - latestIdx;
  if (ahead > 0) console.log(`Upstream is ${ahead} version${ahead > 1 ? 's' : ''} ahead of baseline`);
}
console.log('');

for (let i = 0; i < versions.length; i++) {
  const [version, time] = versions[i];
  const isBaseline = version === baseline;
  const marker = isBaseline ? '  <-- patch baseline' : '';

  // Previous version's time is the window boundary
  const prevIdx = allVersions.findIndex(([v]) => v === version) + 1;
  const prevTime = versions[i + 1]?.[1] ?? allVersions[prevIdx]?.[1];
  const windowCommits = commitsForWindow(time, prevTime);

  if (windowCommits.length === 0) {
    // Single-line entry for version-bump-only releases
    console.log(`  ${shortVersion(version)} — (version bump only)${marker}`);
    console.log('');
    continue;
  }

  // Use first commit's subject as the version title
  const primary = windowCommits[windowCommits.length - 1]; // earliest commit is the main one
  console.log(`  ${shortVersion(version)} — ${primary.subject}${marker}`);
  console.log('');

  // Collect body paragraphs from all commits in this window
  for (const commit of windowCommits.reverse()) {
    if (commit.body.length === 0) continue;

    // Join lines into paragraphs. Blank lines and lines starting with
    // "- " mark paragraph boundaries (preserving commit bullet lists).
    const paragraphs = [];
    let current = [];
    for (const line of commit.body) {
      if (line === '') {
        if (current.length) paragraphs.push(current.join(' '));
        current = [];
      } else if (line.startsWith('- ')) {
        // Flush any running paragraph, then start a new one for this bullet
        if (current.length) paragraphs.push(current.join(' '));
        current = [line.slice(2)]; // strip leading "- "
      } else {
        current.push(line);
      }
    }
    if (current.length) paragraphs.push(current.join(' '));

    for (const para of paragraphs) {
      // Skip lines that duplicate the subject
      if (para === commit.subject) continue;
      // Skip metadata lines
      if (/^(Fixes|Closes|Caution):?\s/i.test(para)) continue;
      if (/^Co-Authored-By:/i.test(para)) continue;
      if (/Published( packages)?:/i.test(para)) continue;
      // Strip trailing "Fixes #NNN" / "Closes #NNN"
      let clean = para
        .replace(/^- /, '')
        .replace(/\s*(Fixes|Closes)\s+#\d+\.?$/i, '');
      if (!clean) continue;
      console.log(`  - ${clean}`);
    }
  }

  console.log('');
}

// ── Dep diff against baseline ──

if (showDiff && baseline) {
  const latestV = versions[0]?.[0];
  if (latestV && latestV !== baseline) {
    console.log(`Dependency diff: ${baseline} -> ${latestV}`);
    console.log('');

    const oldDeps = getDeps(baseline);
    const newDeps = getDeps(latestV);

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
    console.log('');
  }
}
