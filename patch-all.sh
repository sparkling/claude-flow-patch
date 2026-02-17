#!/bin/bash
# patch-all.sh — Orchestrator for folder-per-defect patches
# Safe to run multiple times. Each fix.py is idempotent via patch()/patch_all().
#
# Usage:
#   bash patch-all.sh [--scope global|local|both]
#
# Options:
#   --scope global   Patch only the npx cache (~/.npm/_npx/*)
#   --scope local    Patch only local node_modules in current/parent directories
#   --scope both     Patch both global and local (default)

set -euo pipefail

# Parse arguments
SCOPE="both"
while [[ $# -gt 0 ]]; do
  case $1 in
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: patch-all.sh [--scope global|local|both]"
      echo ""
      echo "Options:"
      echo "  --scope global   Patch only npx cache (~/.npm/_npx/*)"
      echo "  --scope local    Patch only local node_modules"
      echo "  --scope both     Patch both global and local (default)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ ! "$SCOPE" =~ ^(global|local|both)$ ]]; then
  echo "Invalid scope: $SCOPE (must be global, local, or both)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Find installations ──

# Global: npx cache
GLOBAL_CF_BASE=""
GLOBAL_CF_VERSION=""
GLOBAL_RV_CLI=""

GLOBAL_MEMORY=$(ls -t ~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/memory/memory-initializer.js 2>/dev/null | head -1 || true)
if [ -n "$GLOBAL_MEMORY" ]; then
  GLOBAL_CF_BASE=$(echo "$GLOBAL_MEMORY" | sed 's|/memory/memory-initializer.js||')
  GLOBAL_CF_VERSION=$(grep -o '"version": "[^"]*"' "$GLOBAL_CF_BASE/../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "unknown")
fi
GLOBAL_RV_CLI=$(ls -t ~/.npm/_npx/*/node_modules/ruvector/bin/cli.js 2>/dev/null | head -1 || true)

# Local: node_modules in current or parent directories
LOCAL_CF_BASE=""
LOCAL_CF_VERSION=""
LOCAL_RV_CLI=""

for dir in . .. ../.. ../../..; do
  cf_path="$dir/node_modules/@claude-flow/cli/dist/src"
  if [ -d "$cf_path" ]; then
    LOCAL_CF_BASE=$(cd "$cf_path" && pwd)
    LOCAL_CF_VERSION=$(grep -o '"version": "[^"]*"' "$LOCAL_CF_BASE/../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "unknown")
    break
  fi
done

for dir in . .. ../.. ../../..; do
  rv_path="$dir/node_modules/ruvector/bin/cli.js"
  if [ -f "$rv_path" ]; then
    LOCAL_RV_CLI=$(cd "$(dirname "$rv_path")" && pwd)/cli.js
    break
  fi
done

# ── Report what we found ──

echo "[PATCHES] Scope: $SCOPE"
echo ""

if [[ "$SCOPE" == "global" || "$SCOPE" == "both" ]]; then
  if [ -n "$GLOBAL_CF_BASE" ]; then
    echo "  Global @claude-flow/cli: v$GLOBAL_CF_VERSION"
  else
    echo "  Global @claude-flow/cli: not found"
  fi
  if [ -n "$GLOBAL_RV_CLI" ]; then
    echo "  Global ruvector: found"
  else
    echo "  Global ruvector: not found"
  fi
fi

if [[ "$SCOPE" == "local" || "$SCOPE" == "both" ]]; then
  if [ -n "$LOCAL_CF_BASE" ]; then
    echo "  Local @claude-flow/cli: v$LOCAL_CF_VERSION at $LOCAL_CF_BASE"
  else
    echo "  Local @claude-flow/cli: not found"
  fi
  if [ -n "$LOCAL_RV_CLI" ]; then
    echo "  Local ruvector: found at $LOCAL_RV_CLI"
  else
    echo "  Local ruvector: not found"
  fi
fi

echo ""

# ── Apply patches function ──

apply_patches() {
  local base="$1"
  local ruvector_cli="$2"
  local label="$3"

  if [ -z "$base" ] && [ -z "$ruvector_cli" ]; then
    echo "[$label] No packages found, skipping"
    return
  fi

  if [ -n "$base" ]; then
    echo "[$label] Patching @claude-flow/cli at: $base"
  fi
  if [ -n "$ruvector_cli" ]; then
    echo "[$label] Patching ruvector at: $ruvector_cli"
  fi

  export BASE="${base:-/dev/null}"
  export RUVECTOR_CLI="$ruvector_cli"

  # Dynamic discovery: concatenate common.py + all fix.py files sorted alphabetically.
  # Alphabetical order preserves dependencies (e.g. NS-001 < NS-002 < NS-003).
  python3 <(
    cat "$SCRIPT_DIR/lib/common.py"

    for fix in "$SCRIPT_DIR"/patch/*/fix.py; do
      [ -f "$fix" ] && cat "$fix"
    done

    echo "print(f\"[$label] Done: {applied} applied, {skipped} already present\")"
  )

  # Shell-based patches (e.g. EM-002: transformers cache permissions)
  for fix in "$SCRIPT_DIR"/patch/*/fix.sh; do
    [ -f "$fix" ] && bash "$fix" 2>/dev/null || true
  done

  echo ""
}

# ── Apply based on scope ──

if [[ "$SCOPE" == "global" || "$SCOPE" == "both" ]]; then
  apply_patches "$GLOBAL_CF_BASE" "$GLOBAL_RV_CLI" "GLOBAL"
fi

if [[ "$SCOPE" == "local" || "$SCOPE" == "both" ]]; then
  apply_patches "$LOCAL_CF_BASE" "$LOCAL_RV_CLI" "LOCAL"
fi

echo "[PATCHES] Complete"
