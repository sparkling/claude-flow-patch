#!/usr/bin/env node
// scripts/upstream-log.mjs — Show recent @claude-flow/cli releases with changes.
//
// Usage:
//   node scripts/upstream-log.mjs [count]    # default: 10
//   node scripts/upstream-log.mjs 20         # last 20 releases
//   node scripts/upstream-log.mjs --diff     # also diff deps against our baseline
//   node scripts/upstream-log.mjs --full     # show complete GitHub issue bodies
//
// Requires: npm, gh (optional, for commit messages)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Args ──

const flags = ['--diff', '--full'];
const args = process.argv.slice(2).filter(a => !flags.includes(a));
const showDiff = process.argv.includes('--diff');
const fullDetail = process.argv.includes('--full');
const count = parseInt(args[0], 10) || 10;

// ── Our baseline + latest from npm ──

let baseline = null;
try {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');
  const match = readme.match(/@claude-flow\/cli.*?\*\*v?(3\.\d+\.\d+-alpha\.\d+)\*\*/);
  baseline = match?.[1] ?? null;
} catch { /* no README */ }

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

const commits = []; // { time: Date, title: string, body: string }

function fetchCommits() {
  // Fetch as JSON to preserve full multi-line commit messages
  const raw = run('gh api repos/ruvnet/claude-flow/commits?per_page=100');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    for (const item of data) {
      const time = new Date(item.commit?.author?.date);
      const fullMsg = item.commit?.message ?? '';
      const lines = fullMsg.split('\n');
      const title = lines[0] || '';
      // Body is everything after the first blank line
      const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '');
      const body = blankIdx >= 0
        ? lines.slice(blankIdx + 1).filter(l => l.trim()).join('\n').trim()
        : '';
      if (!isNaN(time.getTime()) && title) {
        commits.push({ time, title, body });
      }
    }
  } catch { /* gh not available or parse error */ }
  // Sort oldest first for window matching
  commits.sort((a, b) => a.time - b.time);
}

fetchCommits();

/**
 * Find commits between prevTime (exclusive) and thisTime (inclusive).
 * Skip version-bump-only and checkpoint commits.
 */
function commitsForWindow(thisTime, prevTime) {
  const start = prevTime ? new Date(prevTime) : new Date(0);
  const end = new Date(thisTime);
  return commits
    .filter(c => c.time > start && c.time <= end)
    .filter(c => !/^Bump to 3\.\d/.test(c.title))
    .filter(c => !/^Checkpoint:/.test(c.title));
}

// ── GitHub issue details ──

const issueCache = new Map();

function fetchIssue(num) {
  if (issueCache.has(num)) return issueCache.get(num);
  const raw = run(`gh api repos/ruvnet/claude-flow/issues/${num}`);
  if (!raw) { issueCache.set(num, null); return null; }
  try {
    const data = JSON.parse(raw);
    const rawBody = (data.body ?? '').trim();
    const labels = (data.labels ?? []).map(l => l.name);

    // Summary: filtered lines for compact view
    const summary = rawBody.split('\n')
      .filter(l => l.trim())
      .filter(l => !l.startsWith('##'))
      .filter(l => !l.startsWith('```'))
      .filter(l => !l.startsWith('Fixes #'))
      .filter(l => !l.startsWith('Co-Authored'))
      .filter(l => !l.startsWith('🤖'))
      .slice(0, 6)
      .map(l => l.trim());

    const result = { title: data.title, state: data.state, labels, summary, fullBody: rawBody };
    issueCache.set(num, result);
    return result;
  } catch { issueCache.set(num, null); return null; }
}

/**
 * Extract GitHub issue numbers from a commit title, e.g. "(#1165)" -> [1165]
 */
function extractIssueRefs(title) {
  const matches = [...title.matchAll(/#(\d+)/g)];
  return matches.map(m => parseInt(m[1], 10));
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

  const seenIssues = new Set();
  for (const c of windowCommits.slice(0, 5)) {
    console.log(`    - ${c.title}`);
    if (c.body) {
      const bodyLines = c.body.split('\n')
        .filter(l => l.trim())
        .filter(l => !l.startsWith('Co-Authored-By'))
        .filter(l => !l.startsWith('Published:'));
      for (const bl of (fullDetail ? bodyLines : bodyLines.slice(0, 6))) {
        console.log(`      ${bl.trim()}`);
      }
    }
    // Fetch linked GitHub issues for additional context
    for (const issueNum of extractIssueRefs(c.title)) {
      if (seenIssues.has(issueNum)) continue;
      seenIssues.add(issueNum);
      const issue = fetchIssue(issueNum);
      if (!issue) continue;

      if (fullDetail && issue.fullBody) {
        // --full: show complete issue body
        console.log(`      Issue #${issueNum}: ${issue.title} [${issue.state}]`);
        if (issue.labels.length > 0) {
          console.log(`      Labels: ${issue.labels.join(', ')}`);
        }
        for (const bl of issue.fullBody.split('\n')) {
          console.log(`        ${bl}`);
        }
      } else if (issue.summary.length > 0) {
        // Compact: show summary lines not already in the commit body
        const extra = issue.summary.filter(l => !c.body?.includes(l));
        if (extra.length > 0) {
          console.log(`      Issue #${issueNum}: ${issue.title} [${issue.state}]`);
          for (const bl of extra.slice(0, 4)) {
            console.log(`        ${bl}`);
          }
        }
      }
    }
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
