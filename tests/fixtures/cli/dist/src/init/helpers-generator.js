// Minimal fixture for HK-001, SG-003, WM-003
export function generateHookHandler() {
    const lines = [
        "const router = safeRequire(path.join(helpersDir, 'router.js'));",
        "const session = safeRequire(path.join(helpersDir, 'session.js'));",
        "const memory = safeRequire(path.join(helpersDir, 'memory.js'));",
        "const intelligence = safeRequire(path.join(helpersDir, 'intelligence.cjs'));",
    ];
    return lines.join('\n');
}

// Fixture for WM-003: generateAutoMemoryHook() stubs
export function generateAutoMemoryHook() {
    return `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const DATA_DIR = join(PROJECT_ROOT, '.claude-flow', 'data');
const STORE_PATH = join(DATA_DIR, 'auto-memory-store.json');

const DIM = '\\x1b[2m';
const RESET = '\\x1b[0m';
const dim = (msg) => console.log(\`  \${DIM}\${msg}\${RESET}\`);

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

async function doImport() {
  // Try loading @claude-flow/memory for full functionality
  let memPkg = null;
  try { memPkg = await import('@claude-flow/memory'); } catch {}

  if (!memPkg || !memPkg.AutoMemoryBridge) {
    dim('Memory package not available — auto memory import skipped (non-critical)');
    return;
  }

  // Full implementation deferred to copied version
  dim('Auto memory import available — run init --upgrade for full support');
}

async function doSync() {
  if (!existsSync(STORE_PATH)) {
    dim('No entries to sync');
    return;
  }

  let memPkg = null;
  try { memPkg = await import('@claude-flow/memory'); } catch {}

  if (!memPkg || !memPkg.AutoMemoryBridge) {
    dim('Memory package not available — sync skipped (non-critical)');
    return;
  }

  dim('Auto memory sync available — run init --upgrade for full support');
}

function doStatus() {
  console.log('\\n=== Auto Memory Bridge Status ===\\n');
  console.log('  Package:        Fallback mode (run init --upgrade for full)');
  console.log(\`  Store:          \${existsSync(STORE_PATH) ? 'Initialized' : 'Not initialized'}\`);
  console.log('');
}

const command = process.argv[2] || 'status';

try {
  switch (command) {
    case 'import': await doImport(); break;
    case 'sync': await doSync(); break;
    case 'status': doStatus(); break;
    default:
      console.log('Usage: auto-memory-hook.mjs <import|sync|status>');
      process.exit(1);
  }
} catch (err) {
  dim(\`Error (non-critical): \${err.message}\`);
}
\`;
}
