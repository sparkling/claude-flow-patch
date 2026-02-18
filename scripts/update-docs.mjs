#!/usr/bin/env node
// scripts/update-docs.mjs — Regenerate documentation from dynamic patch discovery.
// Updates: README.md, CLAUDE.md, npm/README.md, npm/config.json
//
// Usage: node scripts/update-docs.mjs [--check]
//   --check  Exit 1 if docs are out of date (for CI), don't write.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from '../lib/discover.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

const data = discover();
const { patches, categories, stats } = data;

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

// ── Update npm/config.json counts ──

function updateNpmConfig() {
  const filePath = resolve(ROOT, 'npm', 'config.json');
  const config = JSON.parse(readFileSync(filePath, 'utf-8'));

  let changed = false;
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

const readmeChanged = replaceMarkerSection(
  resolve(ROOT, 'README.md'),
  'defect-index',
  generateReadmeIndex()
);
if (readmeChanged) {
  anyChanged = true;
  console.log(checkOnly ? 'STALE: README.md' : 'Updated: README.md');
}

const claudeChanged = replaceMarkerSection(
  resolve(ROOT, 'CLAUDE.md'),
  'defect-tables',
  generateClaudeTables()
);
if (claudeChanged) {
  anyChanged = true;
  console.log(checkOnly ? 'STALE: CLAUDE.md' : 'Updated: CLAUDE.md');
}

const npmReadmeChanged = updateNpmReadme();
if (npmReadmeChanged) {
  anyChanged = true;
  console.log(checkOnly ? 'STALE: npm/README.md' : 'Updated: npm/README.md');
}

const npmConfigChanged = updateNpmConfig();
if (npmConfigChanged) {
  anyChanged = true;
  console.log(checkOnly ? 'STALE: npm/config.json' : 'Updated: npm/config.json');
}

if (!anyChanged) {
  console.log('All docs are up to date.');
} else if (checkOnly) {
  console.log('\nDocs are out of date. Run: npm run update-docs');
  process.exit(1);
}
