#!/usr/bin/env node
// Minimal fixture for WM-003 source hook patches (ops 4-6) and WM-004
// Contains the exact old strings that fix.py searches for.

import { existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = '.';
const STORE_PATH = './store.json';

class JsonFileBackend {
  constructor(p) { this.p = p; }
  async initialize() {}
  async shutdown() {}
  async count() { return 0; }
}

async function loadMemoryPackage() { return null; }

// ============================================================================
// Read config from .claude-flow/config.yaml
// ============================================================================

function readConfig() {
  const configPath = join(PROJECT_ROOT, '.claude-flow', 'config.yaml');
  const defaults = {
    learningBridge: { enabled: true, sonaMode: 'balanced', confidenceDecayRate: 0.005, accessBoostAmount: 0.03, consolidationThreshold: 10 },
    memoryGraph: { enabled: true, pageRankDamping: 0.85, maxNodes: 5000, similarityThreshold: 0.8 },
    agentScopes: { enabled: true, defaultScope: 'project' },
  };

  if (!existsSync(configPath)) return defaults;

  try {
    const yaml = readFileSync(configPath, 'utf-8');
    // Simple YAML parser for the memory section
    const getBool = (key) => {
      const match = yaml.match(new RegExp(`${key}:\\s*(true|false)`, 'i'));
      return match ? match[1] === 'true' : undefined;
    };

    const lbEnabled = getBool('learningBridge[\\s\\S]*?enabled');
    if (lbEnabled !== undefined) defaults.learningBridge.enabled = lbEnabled;

    const mgEnabled = getBool('memoryGraph[\\s\\S]*?enabled');
    if (mgEnabled !== undefined) defaults.memoryGraph.enabled = mgEnabled;

    const asEnabled = getBool('agentScopes[\\s\\S]*?enabled');
    if (asEnabled !== undefined) defaults.agentScopes.enabled = asEnabled;

    return defaults;
  } catch {
    return defaults;
  }
}

// ── doImport (WM-003d old string) ──
async function doImport() {
  const memPkg = await loadMemoryPackage();

  const config = readConfig();
  const backend = new JsonFileBackend(STORE_PATH);
  await backend.initialize();

  const bridgeConfig = {
    workingDir: PROJECT_ROOT,
    syncMode: 'on-session-end',
  };
}

// ── doSync (WM-003e old string) ──
async function doSync() {
  const memPkg = await loadMemoryPackage();

  const config = readConfig();
  const backend = new JsonFileBackend(STORE_PATH);
  await backend.initialize();

  const entryCount = await backend.count();
}

// ── doStatus (WM-003f old string) ──
async function doStatus() {
  const memPkg = await loadMemoryPackage();
  console.log(`  Package:        ${memPkg ? '✅ Available' : '❌ Not found'}`);
}
