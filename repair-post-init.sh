#!/bin/bash
# repair-post-init.sh
# Post-init remediation for projects initialized before patch-all.sh.
#
# What it does:
# 1) Finds a patched @claude-flow/cli helper source (local or global npx cache)
# 2) Backs up target .claude/helpers (default)
# 3) Rehydrates helper files into target project
# 4) Preserves/installs a guidance-aware hook-handler when available
# 5) Adds .js/.cjs compatibility copies for router/session/memory modules

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)"
SOURCE_SCOPE="auto"   # auto|local|global
DO_BACKUP=1
DRY_RUN=0
RUN_CHECK=1

usage() {
  cat <<'EOF'
Usage:
  bash repair-post-init.sh [options]

Options:
  --target <dir>        Target project directory (default: current working directory)
  --source <mode>       Source mode: auto|local|global (default: auto)
  --no-backup           Skip .claude/helpers backup
  --dry-run             Print actions without writing files
  --skip-check          Skip check-patches.sh preflight
  -h, --help            Show help

Examples:
  bash repair-post-init.sh --target ~/src/my-project
  bash repair-post-init.sh --target ~/src/my-project --source global
  bash repair-post-init.sh --target ~/src/my-project --dry-run
EOF
}

fail() {
  echo "[repair-post-init] ERROR: $*" >&2
  exit 1
}

log() {
  echo "[repair-post-init] $*"
}

run_cmd() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_DIR="${2:-}"
      shift 2
      ;;
    --source)
      SOURCE_SCOPE="${2:-}"
      shift 2
      ;;
    --no-backup)
      DO_BACKUP=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-check)
      RUN_CHECK=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [[ ! "$SOURCE_SCOPE" =~ ^(auto|local|global)$ ]]; then
  fail "Invalid --source value: $SOURCE_SCOPE (expected auto|local|global)"
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
[ -d "$TARGET_DIR" ] || fail "Target directory not found: $TARGET_DIR"

if [ "$RUN_CHECK" -eq 1 ]; then
  if [ -x "$SCRIPT_DIR/check-patches.sh" ]; then
    log "Running preflight patch check..."
    bash "$SCRIPT_DIR/check-patches.sh" >/dev/null || {
      log "Patch check failed; applying patches..."
      bash "$SCRIPT_DIR/patch-all.sh" --scope global >/dev/null
      bash "$SCRIPT_DIR/check-patches.sh" >/dev/null || fail "Patch verification failed"
    }
  else
    log "check-patches.sh not found; skipping preflight"
  fi
fi

find_local_helpers() {
  local base="$1"
  for d in "$base" "$base/.." "$base/../.." "$base/../../.."; do
    if [ -d "$d/node_modules/@claude-flow/cli/.claude/helpers" ]; then
      (cd "$d/node_modules/@claude-flow/cli/.claude/helpers" && pwd)
      return 0
    fi
  done
  return 1
}

find_global_helpers() {
  ls -td ~/.npm/_npx/*/node_modules/@claude-flow/cli/.claude/helpers 2>/dev/null | head -1 || true
}

SRC_HELPERS=""
case "$SOURCE_SCOPE" in
  local)
    SRC_HELPERS="$(find_local_helpers "$TARGET_DIR" || true)"
    ;;
  global)
    SRC_HELPERS="$(find_global_helpers)"
    ;;
  auto)
    SRC_HELPERS="$(find_local_helpers "$TARGET_DIR" || true)"
    if [ -z "$SRC_HELPERS" ]; then
      SRC_HELPERS="$(find_global_helpers)"
    fi
    ;;
esac

[ -n "$SRC_HELPERS" ] || fail "Could not locate @claude-flow/cli/.claude/helpers (source=$SOURCE_SCOPE)"
[ -d "$SRC_HELPERS" ] || fail "Source helpers directory does not exist: $SRC_HELPERS"
[ -f "$SRC_HELPERS/intelligence.cjs" ] || fail "Source missing intelligence.cjs: $SRC_HELPERS"

TARGET_HELPERS="$TARGET_DIR/.claude/helpers"
BACKUP_PATH="$TARGET_DIR/.claude/helpers.backup.$(date +%Y%m%d-%H%M%S)"

log "Target: $TARGET_DIR"
log "Source helpers: $SRC_HELPERS"
log "Target helpers: $TARGET_HELPERS"

run_cmd mkdir -p "$TARGET_HELPERS"

if [ "$DO_BACKUP" -eq 1 ] && [ -d "$TARGET_HELPERS" ]; then
  if [ "$(ls -A "$TARGET_HELPERS" 2>/dev/null || true)" ]; then
    log "Backing up existing helpers -> $BACKUP_PATH"
    run_cmd cp -a "$TARGET_HELPERS" "$BACKUP_PATH"
  fi
fi

# Copy all helpers except hook-handler.cjs first.
copied=0
for src in "$SRC_HELPERS"/*; do
  [ -e "$src" ] || continue
  base="$(basename "$src")"
  if [ "$base" = "hook-handler.cjs" ]; then
    continue
  fi
  run_cmd cp -a "$src" "$TARGET_HELPERS/$base"
  copied=$((copied + 1))
done

# Prefer guidance-aware hook-handler when installed in target project.
GUIDANCE_HANDLER="$TARGET_DIR/node_modules/claude-flow-guidance-implementation/scaffold/.claude/helpers/hook-handler.cjs"
HOOK_SRC="$SRC_HELPERS/hook-handler.cjs"
HOOK_REASON="@claude-flow/cli helper template"
if [ -f "$GUIDANCE_HANDLER" ]; then
  HOOK_SRC="$GUIDANCE_HANDLER"
  HOOK_REASON="guidance implementation hook-handler"
fi

if [ -f "$HOOK_SRC" ]; then
  log "Installing hook-handler from: $HOOK_REASON"
  run_cmd cp -a "$HOOK_SRC" "$TARGET_HELPERS/hook-handler.cjs"
  copied=$((copied + 1))
fi

# Make guidance hook-handler path resolution work when copied into project .claude/helpers.
if [ "$DRY_RUN" -eq 0 ] && [ -f "$TARGET_HELPERS/hook-handler.cjs" ]; then
  python3 - "$TARGET_HELPERS/hook-handler.cjs" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()

start = text.find("function getBundledScriptPath(scriptName)")
end = text.find("function getGuidanceScriptPath()", start if start >= 0 else 0)

if start >= 0 and end > start and "claude-flow-guidance-implementation" not in text:
    replacement = """function getBundledScriptPath(scriptName) {
  return path.join(
    getProjectDir(),
    'node_modules',
    'claude-flow-guidance-implementation',
    'scaffold',
    'scripts',
    scriptName
  );
}

function resolveGuidanceScriptPath(scriptName) {
  const localPath = path.join(getProjectDir(), 'scripts', scriptName);
  if (fs.existsSync(localPath)) return localPath;

  const bundledPath = getBundledScriptPath(scriptName);
  if (fs.existsSync(bundledPath)) return bundledPath;

  // Keep compatibility for handler copies that live under scaffold/.claude/helpers.
  const relativeBundledPath = path.resolve(__dirname, '..', '..', 'scripts', scriptName);
  if (fs.existsSync(relativeBundledPath)) return relativeBundledPath;

  return localPath;
}

"""
    text = text[:start] + replacement + text[end:]
    path.write_text(text)
PY
fi

# .js/.cjs compatibility for helper modules referenced by different hook-handler variants.
for m in router session memory; do
  if [ -f "$TARGET_HELPERS/$m.js" ] && [ ! -f "$TARGET_HELPERS/$m.cjs" ]; then
    run_cmd cp -a "$TARGET_HELPERS/$m.js" "$TARGET_HELPERS/$m.cjs"
    copied=$((copied + 1))
  fi
  if [ -f "$TARGET_HELPERS/$m.cjs" ] && [ ! -f "$TARGET_HELPERS/$m.js" ]; then
    run_cmd cp -a "$TARGET_HELPERS/$m.cjs" "$TARGET_HELPERS/$m.js"
    copied=$((copied + 1))
  fi
done

if [ "$DRY_RUN" -eq 0 ] && [ -f "$TARGET_HELPERS/hook-handler.cjs" ]; then
  chmod +x "$TARGET_HELPERS/hook-handler.cjs" || true
fi

log "Copied/updated helper files: $copied"

if [ "$DRY_RUN" -eq 0 ] && [ -f "$TARGET_HELPERS/hook-handler.cjs" ]; then
  if node "$TARGET_HELPERS/hook-handler.cjs" status >/dev/null 2>&1; then
    log "Smoke check: hook-handler status OK"
  else
    log "WARN: hook-handler status returned non-zero"
  fi
fi

log "Done."
