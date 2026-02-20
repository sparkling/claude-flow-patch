#!/usr/bin/env node
// scripts/preflight.mjs — Pre-commit/pre-publish consistency check.
// Syncs: doc tables, defect counts, version strings across all files.
// Source of truth: package.json (version), npm/config.json (targets), patch/*/ (defects).
//
// Usage: node scripts/preflight.mjs [--check]
//   --check  Exit 1 if anything is out of date (for hooks/CI), don't write.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from '../lib/discover.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

const data = discover();
const { patches, categories, stats } = data;

// ── Sources of truth ──

const pkgJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const configJson = JSON.parse(readFileSync(resolve(ROOT, 'npm', 'config.json'), 'utf-8'));
const pkgVersion = pkgJson.version;
const cliTarget = configJson.targets['@claude-flow/cli'];
const swarmTarget = configJson.targets['ruv-swarm'];

// ── Helpers ──

/** Group patches by prefix, preserving sort order. */
function groupByPrefix(patches) {
  const groups = new Map();
  for (const p of patches) {
    if (!groups.has(p.prefix)) groups.set(p.prefix, []);
    groups.get(p.prefix).push(p);
  }
  return groups;
}

/**
 * Replace content between marker comments in a file.
 * Returns true if content changed.
 */
function replaceMarkerSection(filePath, markerName, newContent) {
  const beginMarker = `<!-- GENERATED:${markerName}:begin -->`;
  const endMarker = `<!-- GENERATED:${markerName}:end -->`;

  const text = readFileSync(filePath, 'utf-8');
  const beginIdx = text.indexOf(beginMarker);
  const endIdx = text.indexOf(endMarker);

  if (beginIdx < 0 || endIdx < 0) {
    console.error(`ERROR: Markers ${beginMarker} / ${endMarker} not found in ${filePath}`);
    console.error('  Add them around the section that should be auto-generated.');
    process.exit(1);
  }

  const before = text.slice(0, beginIdx + beginMarker.length);
  const after = text.slice(endIdx);
  const updated = `${before}\n${newContent}\n${after}`;

  if (updated === text) return false;

  if (!checkOnly) writeFileSync(filePath, updated);
  return true;
}

/**
 * Replace all occurrences of a version string in a file.
 * Returns true if content changed.
 */
function syncVersionInFile(filePath, oldVersion, newVersion, label) {
  if (oldVersion === newVersion) return false;
  const text = readFileSync(filePath, 'utf-8');
  if (!text.includes(oldVersion)) return false;
  const updated = text.replaceAll(oldVersion, newVersion);
  if (updated === text) return false;
  if (!checkOnly) writeFileSync(filePath, updated);
  return true;
}

// ── Generate README.md defect index ──

function generateReadmeIndex() {
  const groups = groupByPrefix(patches);
  const lines = [`${stats.total} defects across ${stats.categories} categories.`];

  for (const [prefix, items] of groups) {
    const catLabel = categories[prefix] ?? prefix;
    lines.push('');
    lines.push(`### ${prefix} -- ${catLabel}`);
    lines.push('');
    lines.push('| ID | Description <img width="500" height="1" /> | Severity | GitHub&nbsp;Issue |');
    lines.push('|----|-------------|----------|--------------|');

    for (const p of items) {
      const idLink = `[${p.id.replace('-', '&#8209;')}](patch/${p.dir}/)`;
      const ghLink = p.githubUrl ? `[${p.github}](${p.githubUrl})` : p.github;
      lines.push(`| ${idLink} | ${p.title} | ${p.severity} | ${ghLink} |`);
    }
  }

  return lines.join('\n');
}

// ── Generate CLAUDE.md defect tables ──

function generateClaudeTables() {
  const groups = groupByPrefix(patches);
  const lines = [];

  // Category summary table
  lines.push('| Prefix | Category | Count |');
  lines.push('|--------|----------|-------|');
  for (const [prefix, items] of groups) {
    const catLabel = categories[prefix] ?? prefix;
    lines.push(`| ${prefix} | ${catLabel} | ${items.length} |`);
  }

  // Full defect list
  lines.push('');
  lines.push(`## All ${stats.total} Defects`);
  lines.push('');
  lines.push('| ID | GitHub Issue | Severity |');
  lines.push('|----|-------------|----------|');
  for (const p of patches) {
    const ghText = p.github ? `${p.github} ${p.title}` : p.title;
    const ghLink = p.githubUrl ? `[${ghText}](${p.githubUrl})` : ghText;
    lines.push(`| ${p.id} | ${ghLink} | ${p.severity} |`);
  }

  return lines.join('\n');
}

// ── Generate npm/README.md defect list ──

const REPO_URL = 'https://github.com/sparkling/claude-flow-patch';

function generateNpmDefectList() {
  const groups = groupByPrefix(patches);
  const lines = [
    `${stats.total} tracked defects across ${stats.categories} categories.`,
    '',
    '| Defect | Description | GitHub Issue |',
    '|--------|-------------|-------------|',
  ];

  for (const [, items] of groups) {
    for (const p of items) {
      const defectLink = `[${p.id}](${REPO_URL}/tree/master/patch/${p.dir})`;
      const ghLink = p.githubUrl ? `[${p.github}](${p.githubUrl})` : p.github;
      lines.push(`| ${defectLink} | ${p.title} | ${ghLink} |`);
    }
  }

  return lines.join('\n');
}

function updateNpmReadme() {
  return replaceMarkerSection(
    resolve(ROOT, 'npm', 'README.md'),
    'npm-defects',
    generateNpmDefectList()
  );
}

// ── Sync npm/config.json (version + defect counts) ──

function updateNpmConfig() {
  const filePath = resolve(ROOT, 'npm', 'config.json');
  const config = JSON.parse(readFileSync(filePath, 'utf-8'));

  let changed = false;

  // Sync version.current from package.json
  if (config.version?.current !== pkgVersion) {
    config.version.current = pkgVersion;
    changed = true;
  }

  // Sync defect counts from discovery
  if (config.defects?.total !== stats.total) {
    config.defects.total = stats.total;
    changed = true;
  }
  if (config.defects?.categories !== stats.categories) {
    config.defects.categories = stats.categories;
    changed = true;
  }

  if (changed && !checkOnly) {
    writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  }
  return changed;
}

// ── Main ──

let anyChanged = false;

function report(changed, label) {
  if (!changed) return;
  anyChanged = true;
  console.log(checkOnly ? `STALE: ${label}` : `Updated: ${label}`);
}

// 1. Doc tables (marker-based sections)
report(
  replaceMarkerSection(resolve(ROOT, 'README.md'), 'defect-index', generateReadmeIndex()),
  'README.md (defect index)'
);
report(
  replaceMarkerSection(resolve(ROOT, 'CLAUDE.md'), 'defect-tables', generateClaudeTables()),
  'CLAUDE.md (defect tables)'
);
report(updateNpmReadme(), 'npm/README.md (defect list)');

// 2. Config sync (version + counts)
report(updateNpmConfig(), 'npm/config.json (version/counts)');

// 3. Upstream baseline version in prose (sync from npm/config.json targets)
// Find any stale version strings and replace with current targets.
// We scan for the pattern v?X.Y.Z-alpha.N and replace if it doesn't match config.
const versionFiles = ['README.md', 'CLAUDE.md', 'npm/README.md', 'AGENTS.md'];
for (const file of versionFiles) {
  const filePath = resolve(ROOT, file);
  let text;
  try { text = readFileSync(filePath, 'utf-8'); } catch { continue; }

  let updated = text;

  // Sync @claude-flow/cli version references
  // Match patterns like **v3.1.0-alpha.NN** or `3.1.0-alpha.NN` or @3.1.0-alpha.NN
  const cliRe = /(?<=[@`*v])3\.1\.0-alpha\.\d+/g;
  updated = updated.replace(cliRe, cliTarget);

  if (updated !== text) {
    if (!checkOnly) writeFileSync(filePath, updated);
    report(true, `${file} (upstream baseline)`);
  }
}

if (!anyChanged) {
  console.log('All files are up to date.');
} else if (checkOnly) {
  console.log('\nFiles are out of date. Run: npm run preflight');
  process.exit(1);
}
