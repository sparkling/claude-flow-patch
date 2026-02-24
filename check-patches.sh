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

# ── Shared discovery ──
. "$SCRIPT_DIR/lib/discover.sh"

# ── Collect installs ──
INSTALLS=()

if [[ $DO_GLOBAL -eq 1 ]]; then
  while IFS= read -r line; do
    [ -n "$line" ] && INSTALLS+=("$line")
  done < <(discover_all_cf_installs)
fi

if [[ -n "$TARGET_DIR" && -d "$TARGET_DIR" ]]; then
  while IFS= read -r line; do
    [ -n "$line" ] && INSTALLS+=("$line")
  done < <(discover_target_installs "$TARGET_DIR")
fi

if [[ ${#INSTALLS[@]} -eq 0 ]]; then
  echo "[PATCHES] WARN: Cannot find claude-flow CLI files"
  exit 0
fi

# ── Path resolver ──

resolve_path() {
  local base="$1"
  local rv_base="$2"
  local rs_base="$3"
  local pkg="$4"
  local relpath="$5"
  case "$pkg" in
    ruvector)  echo "$rv_base/$relpath" ;;
    ruv-swarm) echo "$rs_base/$relpath" ;;
    @claude-flow/*)
      # base is <nm>/@claude-flow/cli/dist/src → derive <nm>/@claude-flow/<pkg>
      local cf_scope
      cf_scope="$(cd "$base/../../../.." 2>/dev/null && pwd)"
      local subpkg="${pkg#@claude-flow/}"
      echo "$cf_scope/@claude-flow/$subpkg/$relpath"
      ;;
    *)         echo "$base/$relpath" ;;
  esac
}

# ── Check sentinels for a single install ──
# Returns 0 if all OK, 1 if any failed.

check_sentinels_for_install() {
  local base="$1"
  local rv_cli="$2"
  local rs_root="$3"

  # Derive ruvector base from cli path
  local rv_base=""
  if [ -n "$rv_cli" ]; then
    rv_base="$(cd "$(dirname "$rv_cli")/.." 2>/dev/null && pwd)"
  fi

  local all_ok=true

  for sentinel_file in "$SCRIPT_DIR"/patch/*/sentinel; do
    [ -f "$sentinel_file" ] || continue

    # PATCH_INCLUDE / PATCH_EXCLUDE env vars filter by directory name regex
    local dirname
    dirname=$(basename "$(dirname "$sentinel_file")")
    local matchname="${dirname#[0-9][0-9][0-9]-}"   # strip NNN- prefix for pattern matching
    if [ -n "${PATCH_INCLUDE:-}" ] && ! echo "$matchname" | grep -qE "$PATCH_INCLUDE"; then
      continue
    fi
    if [ -n "${PATCH_EXCLUDE:-}" ] && echo "$matchname" | grep -qE "$PATCH_EXCLUDE"; then
      continue
    fi

    # Default package context (can be switched by "package:" directives in the file)
    local pkg="claude-flow"

    # Check if first package: line is for an optional package we don't have
    local first_pkg_line
    first_pkg_line=$(grep -m1 '^package:' "$sentinel_file" 2>/dev/null || true)
    if [ -n "$first_pkg_line" ]; then
      local first_pkg="${first_pkg_line#package:}"
      first_pkg="${first_pkg#"${first_pkg%%[![:space:]]*}"}"
      first_pkg="${first_pkg%%[[:space:]]*}"
      # Only skip the whole file if ALL lines are for a single unavailable package
      local has_non_pkg_default=false
      grep -v '^package:' "$sentinel_file" | grep -v '^$' | grep -v '^none$' | head -1 | grep -q '.' && has_non_pkg_default=true
      if ! $has_non_pkg_default; then
        case "$first_pkg" in
          ruvector)  [ -z "$rv_cli" ] && continue ;;
          ruv-swarm) [ -z "$rs_root" ] && continue ;;
        esac
      fi
    fi

    # Process each line — "package:" switches the current package context
    while IFS= read -r line; do
      line="${line#"${line%%[![:space:]]*}"}"  # trim leading whitespace
      [[ -z "$line" ]] && continue

      # package: directive switches context for subsequent grep/absent lines
      if [[ "$line" == package:* ]]; then
        pkg="${line#package:}"
        pkg="${pkg#"${pkg%%[![:space:]]*}"}"  # trim leading whitespace
        pkg="${pkg%%[[:space:]]*}"            # trim trailing whitespace
        continue
      fi

      if [[ "$line" == "none" ]]; then
        continue

      elif [[ "$line" =~ ^absent\ \"(.+)\"\ (.+)$ ]]; then
        local pattern="${BASH_REMATCH[1]}"
        local filepath
        filepath=$(resolve_path "$base" "$rv_base" "$rs_root" "$pkg" "${BASH_REMATCH[2]}")
        if grep -q "$pattern" "$filepath" 2>/dev/null; then
          all_ok=false
        fi

      elif [[ "$line" =~ ^grep\ \"(.+)\"\ (.+)$ ]]; then
        local pattern="${BASH_REMATCH[1]}"
        local filepath
        filepath=$(resolve_path "$base" "$rv_base" "$rs_root" "$pkg" "${BASH_REMATCH[2]}")
        # Skip if target file doesn't exist (e.g. umbrella layout missing .claude/helpers/)
        if [ -f "$filepath" ] && ! grep -q "$pattern" "$filepath" 2>/dev/null; then
          all_ok=false
        fi
      fi
    done < "$sentinel_file"
  done

  $all_ok
}

# ── Check all installs ──

any_failed=false
first_version=""

for entry in "${INSTALLS[@]}"; do
  IFS=$'\t' read -r dist_src version rv_cli rs_root writable <<< "$entry"
  # "-" is the placeholder for empty fields (bash IFS collapses consecutive tabs)
  [ "$rv_cli" = "-" ] && rv_cli=""
  [ "$rs_root" = "-" ] && rs_root=""
  [ -z "$first_version" ] && first_version="$version"

  if ! check_sentinels_for_install "$dist_src" "$rv_cli" "$rs_root"; then
    any_failed=true
    break  # One failure is enough to trigger reapply
  fi
done

# ── Syntax validation: node --check on ALL patched JS files ──
# Runs independently of sentinel checks so SyntaxErrors are always caught.

syntax_failed=false
for entry in "${INSTALLS[@]}"; do
  IFS=$'\t' read -r dist_src version rv_cli rs_root writable <<< "$entry"

  # Derive @claude-flow scope from dist/src path
  cf_scope="$(cd "$dist_src/../../../.." 2>/dev/null && pwd)"

  SYNTAX_FILES=(
    # @claude-flow/cli
    "$dist_src/commands/config.js"
    "$dist_src/commands/start.js"
    "$dist_src/commands/init.js"
    "$dist_src/commands/doctor.js"
    "$dist_src/commands/status.js"
    "$dist_src/commands/swarm.js"
    "$dist_src/commands/daemon.js"
    "$dist_src/commands/hooks.js"
    "$dist_src/commands/memory.js"
    "$dist_src/commands/neural.js"
    "$dist_src/memory/memory-initializer.js"
    "$dist_src/memory/intelligence.js"
    "$dist_src/init/executor.js"
    "$dist_src/init/helpers-generator.js"
    "$dist_src/init/settings-generator.js"
    "$dist_src/init/types.js"
    "$dist_src/init/claudemd-generator.js"
    "$dist_src/mcp-tools/hooks-tools.js"
    "$dist_src/mcp-tools/memory-tools.js"
    "$dist_src/mcp-tools/embeddings-tools.js"
    "$dist_src/services/worker-daemon.js"
    "$dist_src/services/headless-worker-executor.js"
    "$dist_src/index.js"
    # @claude-flow/memory (WM-008)
    "$cf_scope/@claude-flow/memory/dist/agentdb-backend.js"
    # @claude-flow/neural (WM-008)
    "$cf_scope/@claude-flow/neural/dist/reasoning-bank.js"
    # @claude-flow/shared (WM-008)
    "$cf_scope/@claude-flow/shared/dist/core/config/defaults.js"
  )
  for js_file in "${SYNTAX_FILES[@]}"; do
    [ -f "$js_file" ] || continue
    if ! node --check "$js_file" 2>/tmp/syntax-check-err.$$; then
      echo "[PATCHES] SYNTAX ERROR: $js_file"
      cat /tmp/syntax-check-err.$$
      syntax_failed=true
      any_failed=true
    fi
    rm -f /tmp/syntax-check-err.$$
  done
done

VERSION="${first_version:-unknown}"

if ! $any_failed; then
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
  echo "[PATCHES] Auto-reapplied. Stopping existing daemons..."
  npx @claude-flow/cli@latest daemon stop 2>/dev/null
  # Fallback: kill by PID file if daemon stop missed an orphan (project-scoped, not global)
  _pid=$(cat .claude-flow/daemon.pid 2>/dev/null)
  if [ -n "$_pid" ]; then kill "$_pid" 2>/dev/null || true; rm -f .claude-flow/daemon.pid; fi
  sleep 1
  npx @claude-flow/cli@latest daemon start 2>/dev/null
  echo "[PATCHES] Daemon restarted in background (PID: $(cat .claude-flow/daemon.pid 2>/dev/null || echo 'unknown'))"
  echo ""
else
  echo "[PATCHES] ERROR: patch-all.sh not found at $SCRIPT_DIR"
  echo "[PATCHES] Run manually: bash ~/src/claude-flow-patch/patch-all.sh"
fi
