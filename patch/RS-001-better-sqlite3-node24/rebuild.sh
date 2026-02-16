#!/bin/bash
# RS-001: After patching package.json, reinstall better-sqlite3 with
# correct prebuilt binaries for Node 24.
#
# Usage: bash rebuild.sh

set -euo pipefail

RS_DIR=$(find ~/.npm/_npx -path "*/node_modules/ruv-swarm" -type d 2>/dev/null | head -1)

if [ -z "$RS_DIR" ]; then
  echo "[RS-001] ruv-swarm not found in npx cache, skipping rebuild"
  exit 0
fi

echo "[RS-001] Reinstalling better-sqlite3@^12.0.0 in: $RS_DIR"

cd "$RS_DIR"
npm install better-sqlite3@"^12.0.0" --no-save 2>&1

echo "[RS-001] Verifying..."
if npx -y ruv-swarm --version 2>/dev/null; then
  echo "[RS-001] OK: ruv-swarm starts successfully"
else
  echo "[RS-001] WARN: ruv-swarm still failing — may need full cache clear"
  echo "  Try: rm -rf ~/.npm/_npx/$(basename $(dirname $RS_DIR)) && npx -y ruv-swarm --version"
fi
