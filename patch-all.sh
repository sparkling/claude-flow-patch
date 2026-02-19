#!/bin/bash
# patch-all.sh — Orchestrator for folder-per-defect patches
# Safe to run multiple times. Each fix.py is idempotent via patch()/patch_all().
#
# Usage:
#   bash patch-all.sh [--global] [--target <dir>]
#
# Options:
#   --global             Patch the npx cache (~/.npm/_npx/*)
#   --target <dir>       Patch node_modules inside <dir>
#
# If neither flag is given, --global is assumed.

set -euo pipefail

# Parse arguments
DO_GLOBAL=0
TARGET_DIR=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --global)
      DO_GLOBAL=1
      shift
      ;;
    --target)
      TARGET_DIR="${2:-}"
      if [[ -z "$TARGET_DIR" ]]; then
        echo "Error: --target requires a directory argument"
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      echo "Usage: patch-all.sh [--global] [--target <dir>]"
      echo ""
      echo "Options:"
      echo "  --global           Patch the npx cache (~/.npm/_npx/*)"
      echo "  --target <dir>     Patch node_modules inside <dir>"
      echo ""
      echo "If neither flag is given, --global is assumed."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Default: --global when nothing specified
if [[ $DO_GLOBAL -eq 0 && -z "$TARGET_DIR" ]]; then
  DO_GLOBAL=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Find installations ──

# Global: npx cache
GLOBAL_CF_BASE=""
GLOBAL_CF_VERSION=""
GLOBAL_RV_CLI=""

if [[ $DO_GLOBAL -eq 1 ]]; then
  GLOBAL_MEMORY=$(ls -t ~/.npm/_npx/*/node_modules/@claude-flow/cli/dist/src/memory/memory-initializer.js 2>/dev/null | head -1 || true)
  if [ -n "$GLOBAL_MEMORY" ]; then
    GLOBAL_CF_BASE=$(echo "$GLOBAL_MEMORY" | sed 's|/memory/memory-initializer.js||')
    GLOBAL_CF_VERSION=$(grep -o '"version": "[^"]*"' "$GLOBAL_CF_BASE/../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "unknown")
  fi
  GLOBAL_RV_CLI=$(ls -t ~/.npm/_npx/*/node_modules/ruvector/bin/cli.js 2>/dev/null | head -1 || true)
fi

# Target: node_modules in specified directory
TARGET_CF_BASE=""
TARGET_CF_VERSION=""
TARGET_RV_CLI=""

if [[ -n "$TARGET_DIR" ]]; then
  if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Error: target directory does not exist: $TARGET_DIR"
    exit 1
  fi
  TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
  cf_path="$TARGET_DIR/node_modules/@claude-flow/cli/dist/src"
  if [ -d "$cf_path" ]; then
    TARGET_CF_BASE="$cf_path"
    TARGET_CF_VERSION=$(grep -o '"version": "[^"]*"' "$TARGET_CF_BASE/../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "unknown")
  fi
  rv_path="$TARGET_DIR/node_modules/ruvector/bin/cli.js"
  if [ -f "$rv_path" ]; then
    TARGET_RV_CLI="$(cd "$(dirname "$rv_path")" && pwd)/cli.js"
  fi
fi

# ── Report what we found ──

TARGETS=()
if [[ $DO_GLOBAL -eq 1 ]]; then TARGETS+=(global); fi
if [[ -n "$TARGET_DIR" ]]; then TARGETS+=("$TARGET_DIR"); fi
echo "[PATCHES] Targets: ${TARGETS[*]}"
echo ""

if [[ $DO_GLOBAL -eq 1 ]]; then
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

if [[ -n "$TARGET_DIR" ]]; then
  if [ -n "$TARGET_CF_BASE" ]; then
    echo "  Target @claude-flow/cli: v$TARGET_CF_VERSION at $TARGET_CF_BASE"
  else
    echo "  Target @claude-flow/cli: not found in $TARGET_DIR"
  fi
  if [ -n "$TARGET_RV_CLI" ]; then
    echo "  Target ruvector: found at $TARGET_RV_CLI"
  else
    echo "  Target ruvector: not found in $TARGET_DIR"
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
  #
  # PATCH_INCLUDE / PATCH_EXCLUDE env vars filter by directory name regex.
  python3 <(
    cat "$SCRIPT_DIR/lib/common.py"

    for fix in "$SCRIPT_DIR"/patch/*/fix.py; do
      [ -f "$fix" ] || continue
      dirname=$(basename "$(dirname "$fix")")
      matchname="${dirname#[0-9][0-9][0-9]-}"   # strip NNN- prefix for pattern matching
      if [ -n "${PATCH_INCLUDE:-}" ] && ! echo "$matchname" | grep -qE "$PATCH_INCLUDE"; then
        continue
      fi
      if [ -n "${PATCH_EXCLUDE:-}" ] && echo "$matchname" | grep -qE "$PATCH_EXCLUDE"; then
        continue
      fi
      cat "$fix"
    done

    echo "print(f\"[$label] Done: {applied} applied, {skipped} already present\")"
  )

  # Shell-based patches (e.g. EM-002: transformers cache permissions)
  for fix in "$SCRIPT_DIR"/patch/*/fix.sh; do
    [ -f "$fix" ] || continue
    dirname=$(basename "$(dirname "$fix")")
    matchname="${dirname#[0-9][0-9][0-9]-}"   # strip NNN- prefix for pattern matching
    if [ -n "${PATCH_INCLUDE:-}" ] && ! echo "$matchname" | grep -qE "$PATCH_INCLUDE"; then
      continue
    fi
    if [ -n "${PATCH_EXCLUDE:-}" ] && echo "$matchname" | grep -qE "$PATCH_EXCLUDE"; then
      continue
    fi
    bash "$fix" 2>/dev/null || true
  done

  echo ""
}

# ── Apply based on flags ──

if [[ $DO_GLOBAL -eq 1 ]]; then
  apply_patches "$GLOBAL_CF_BASE" "$GLOBAL_RV_CLI" "GLOBAL"
fi

if [[ -n "$TARGET_DIR" ]]; then
  apply_patches "$TARGET_CF_BASE" "$TARGET_RV_CLI" "TARGET"
fi

echo "[PATCHES] Complete"
