#!/usr/bin/env node
// Minimal fixture for WM-003 source hook patches (ops 4-6)
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
function readConfig() { return {}; }

// ── doImport (WM-003d old string) ──
async function doImport() {
  const memPkg = await loadMemoryPackage();

  const config = readConfig();
  const backend = new JsonFileBackend(STORE_PATH);
  await backend.initialize();

  const bridgeConfig = {
    workingDir: PROJECT_ROOT,
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
