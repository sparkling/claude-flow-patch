#!/bin/bash
# npm/package.sh — Build the npm package tarball
#
# Usage:
#   bash npm/package.sh [--dry-run]
#
# Creates a .tgz in npm/dist/ ready for publishing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NPM_DIR="$SCRIPT_DIR"
DIST_DIR="$NPM_DIR/dist"
CONFIG="$NPM_DIR/config.json"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

# Read version from config
if command -v node >/dev/null 2>&1; then
  VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf-8')).version.current)")
else
  VERSION=$(grep -o '"current": "[^"]*"' "$CONFIG" | cut -d'"' -f4)
fi

echo "[package] claude-flow-patch v$VERSION"
echo "[package] Root: $ROOT_DIR"

# Verify package.json version matches config
PKG_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT_DIR/package.json','utf-8')).version)")
if [ "$PKG_VERSION" != "$VERSION" ]; then
  echo "[package] WARN: package.json version ($PKG_VERSION) != config version ($VERSION)"
  echo "[package] Updating package.json..."
  if [ "$DRY_RUN" -eq 0 ]; then
    node -e "
      const pkg = JSON.parse(require('fs').readFileSync('$ROOT_DIR/package.json','utf-8'));
      pkg.version = '$VERSION';
      require('fs').writeFileSync('$ROOT_DIR/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
  fi
fi

# Copy npm README into root for packaging (npm uses root README.md)
echo "[package] Staging npm README..."
if [ "$DRY_RUN" -eq 0 ]; then
  cp "$ROOT_DIR/README.md" "$NPM_DIR/.README.repo.bak"
  cp "$NPM_DIR/README.md" "$ROOT_DIR/README.md"
fi

# Create dist directory
mkdir -p "$DIST_DIR"

# Pack
echo "[package] Creating tarball..."
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[package] DRY RUN — would run: npm pack"
  cd "$ROOT_DIR" && npm pack --dry-run 2>&1 | tail -20
else
  cd "$ROOT_DIR"
  TARBALL=$(npm pack 2>&1 | tail -1)
  mv "$TARBALL" "$DIST_DIR/"
  echo "[package] Created: npm/dist/$TARBALL"
fi

# Restore repo README
if [ "$DRY_RUN" -eq 0 ] && [ -f "$NPM_DIR/.README.repo.bak" ]; then
  mv "$NPM_DIR/.README.repo.bak" "$ROOT_DIR/README.md"
  echo "[package] Restored repo README"
fi

echo "[package] Done"
