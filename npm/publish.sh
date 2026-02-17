#!/bin/bash
# npm/publish.sh — Publish the package to npm
#
# Usage:
#   bash npm/publish.sh [--dry-run] [--bump patch|minor|major] [--tag latest|beta]
#
# Reads settings from npm/config.json. Runs package.sh first, then publishes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$SCRIPT_DIR/config.json"
DIST_DIR="$SCRIPT_DIR/dist"

DRY_RUN=0
BUMP=""
TAG="latest"

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=1; shift ;;
    --bump) BUMP="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: publish.sh [--dry-run] [--bump patch|minor|major] [--tag latest|beta]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Read current version
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf-8')).version.current)")

echo "[publish] claude-flow-patch v$VERSION"

# Bump version if requested
if [ -n "$BUMP" ]; then
  echo "[publish] Bumping version: $BUMP"
  if [ "$DRY_RUN" -eq 0 ]; then
    NEW_VERSION=$(cd "$ROOT_DIR" && npm version "$BUMP" --no-git-tag-version 2>&1 | tr -d 'v')
    # Update config.json
    node -e "
      const cfg = JSON.parse(require('fs').readFileSync('$CONFIG','utf-8'));
      cfg.version.current = '$NEW_VERSION';
      require('fs').writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2) + '\n');
    "
    VERSION="$NEW_VERSION"
    echo "[publish] New version: $VERSION"
  else
    echo "[publish] DRY RUN — would bump $BUMP"
  fi
fi

# Pre-flight checks
echo "[publish] Pre-flight checks..."

# 1. Verify patches apply cleanly
echo "[publish]   Verifying patches..."
bash "$ROOT_DIR/patch-all.sh" --scope global 2>&1 | tail -3

# 2. Verify sentinels
echo "[publish]   Verifying sentinels..."
bash "$ROOT_DIR/check-patches.sh" 2>&1 | tail -3

# 3. Package
echo "[publish] Building package..."
if [ "$DRY_RUN" -eq 1 ]; then
  bash "$SCRIPT_DIR/package.sh" --dry-run
else
  bash "$SCRIPT_DIR/package.sh"
fi

# Find tarball
TARBALL=$(ls -t "$DIST_DIR"/claude-flow-patch-*.tgz 2>/dev/null | head -1)
if [ -z "$TARBALL" ] && [ "$DRY_RUN" -eq 0 ]; then
  echo "[publish] ERROR: No tarball found in $DIST_DIR"
  exit 1
fi

# Publish
echo "[publish] Publishing to npm (tag: $TAG)..."
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[publish] DRY RUN — would run: npm publish $TARBALL --tag $TAG"
else
  npm publish "$TARBALL" --tag "$TAG" --access public
  echo "[publish] Published claude-flow-patch@$VERSION (tag: $TAG)"
fi

echo "[publish] Done"
