#!/bin/bash
# check-patches.sh — Dynamic sentinel checker
# Reads patch/*/sentinel files to verify patches are still applied.
# On session start: detects wipes, auto-reapplies, warns user.
#
# Usage:
#   bash check-patches.sh [--global] [--target <dir>]
#
# If neither flag is given, --global is assumed.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse arguments ──
DO_GLOBAL=0
TARGET_DIR=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --global) DO_GLOBAL=1; shift ;;
    --target) TARGET_DIR="${2:-}"; shift 2 ;;
    *) shift ;;  # ignore unknown (e.g. filter env handled by caller)
  esac
done

if [[ $DO_GLOBAL -eq 0 && -z "$TARGET_DIR" ]]; then
  DO_GLOBAL=1
fi

# ── Locate packages ──

find_base_in_global() {
  local mem=$(find ~/.npm/_npx -name "memory-initializer.js" -path "*/memory/*" 2>/dev/null | head -1)
  if [ -n "$mem" ]; then
    echo "$(cd "$(dirname "$mem")/.." && pwd)"
  fi
}

find_base_in_target() {
  local dir="$1"
  local cf="$dir/node_modules/@claude-flow/cli/dist/src"
  if [ -d "$cf" ]; then
    echo "$(cd "$cf" && pwd)"
  fi
}

BASE=""
VERSION=""
if [[ $DO_GLOBAL -eq 1 ]]; then
  BASE=$(find_base_in_global)
fi
if [[ -z "$BASE" && -n "$TARGET_DIR" ]]; then
  BASE=$(find_base_in_target "$TARGET_DIR")
fi

if [ -z "$BASE" ]; then
  echo "[PATCHES] WARN: Cannot find claude-flow CLI files"
  exit 0
fi

VERSION=$(grep -o '"version": *"[^"]*"' "$BASE/../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4)

# External packages (optional) — search same tree as BASE
PKG_ROOT=$(cd "$BASE/../.." && pwd)
SEARCH_ROOT=$(dirname "$PKG_ROOT")

RV_CLI=$(find "$SEARCH_ROOT" -name "cli.js" -path "*/ruvector/bin/*" 2>/dev/null | head -1)
RV_BASE=""
if [ -n "$RV_CLI" ]; then
  RV_BASE=$(cd "$(dirname "$RV_CLI")/.." && pwd)
fi

RS_PKG=$(find "$SEARCH_ROOT" -path "*/ruv-swarm/package.json" 2>/dev/null | head -1)
RS_BASE=""
if [ -n "$RS_PKG" ]; then
  RS_BASE=$(dirname "$RS_PKG")
fi

# ── Path resolver ──

resolve_path() {
  local pkg="$1"
  local relpath="$2"
  case "$pkg" in
    ruvector)  echo "$RV_BASE/$relpath" ;;
    ruv-swarm) echo "$RS_BASE/$relpath" ;;
    *)         echo "$BASE/$relpath" ;;
  esac
}

# ── Dynamic sentinel checks ──
# Reads each patch/*/sentinel file for verification directives.

all_ok=true

for sentinel_file in "$SCRIPT_DIR"/patch/*/sentinel; do
  [ -f "$sentinel_file" ] || continue

  # PATCH_INCLUDE / PATCH_EXCLUDE env vars filter by directory name regex
  dirname=$(basename "$(dirname "$sentinel_file")")
  matchname="${dirname#[0-9][0-9][0-9]-}"   # strip NNN- prefix for pattern matching
  if [ -n "${PATCH_INCLUDE:-}" ] && ! echo "$matchname" | grep -qE "$PATCH_INCLUDE"; then
    continue
  fi
  if [ -n "${PATCH_EXCLUDE:-}" ] && echo "$matchname" | grep -qE "$PATCH_EXCLUDE"; then
    continue
  fi

  # Read package line (default: claude-flow)
  pkg="claude-flow"
  pkg_line=$(grep -m1 '^package:' "$sentinel_file" 2>/dev/null || true)
  if [ -n "$pkg_line" ]; then
    pkg="${pkg_line#package:}"
    pkg="${pkg#"${pkg%%[![:space:]]*}"}"  # trim leading whitespace
    pkg="${pkg%%[[:space:]]*}"            # trim trailing whitespace
  fi

  # Skip if required package not installed
  case "$pkg" in
    ruvector)  [ -z "$RV_CLI" ] && continue ;;
    ruv-swarm) [ -z "$RS_PKG" ] && continue ;;
  esac

  # Process each line
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"  # trim leading whitespace
    [[ -z "$line" ]] && continue
    [[ "$line" == package:* ]] && continue

    if [[ "$line" == "none" ]]; then
      continue

    elif [[ "$line" =~ ^absent\ \"(.+)\"\ (.+)$ ]]; then
      pattern="${BASH_REMATCH[1]}"
      filepath=$(resolve_path "$pkg" "${BASH_REMATCH[2]}")
      if grep -q "$pattern" "$filepath" 2>/dev/null; then
        all_ok=false
      fi

    elif [[ "$line" =~ ^grep\ \"(.+)\"\ (.+)$ ]]; then
      pattern="${BASH_REMATCH[1]}"
      filepath=$(resolve_path "$pkg" "${BASH_REMATCH[2]}")
      if ! grep -q "$pattern" "$filepath" 2>/dev/null; then
        all_ok=false
      fi
    fi
  done < "$sentinel_file"
done

if $all_ok; then
  echo "[PATCHES] OK: All patches verified (v$VERSION)"
  exit 0
fi

# ── Patches wiped — auto-reapply and warn ──

echo ""
echo "============================================"
echo "  WARNING: claude-flow patches were wiped!"
echo "  Likely cause: npx cache update (v$VERSION)"
echo "============================================"
echo ""

if [ -x "$SCRIPT_DIR/patch-all.sh" ]; then
  REAPPLY_ARGS=()
  if [[ $DO_GLOBAL -eq 1 ]]; then REAPPLY_ARGS+=(--global); fi
  if [[ -n "$TARGET_DIR" ]]; then REAPPLY_ARGS+=(--target "$TARGET_DIR"); fi
  bash "$SCRIPT_DIR/patch-all.sh" "${REAPPLY_ARGS[@]}"
  echo ""
  echo "[PATCHES] Auto-reapplied. Restarting daemon..."
  npx @claude-flow/cli@latest daemon stop 2>/dev/null
  npx @claude-flow/cli@latest daemon start 2>/dev/null
  echo "[PATCHES] Daemon restarted with patched code."
  echo ""
else
  echo "[PATCHES] ERROR: patch-all.sh not found at $SCRIPT_DIR"
  echo "[PATCHES] Run manually: bash ~/src/claude-flow-patch/patch-all.sh"
fi
