#!/bin/bash
# WM-008: Upgrade agentdb v2 -> v3 in npm cache
# GitHub: #1207
# Skips if agentdb is already v3 or not installed

set -euo pipefail

# BASE is set by patch-all.sh to the dist/src directory
if [ -z "${BASE:-}" ] || [ "$BASE" = "/dev/null" ]; then
    exit 0  # No @claude-flow/cli found
fi

# node_modules/@claude-flow/cli/dist/src -> node_modules
NM_ROOT="$(cd "$BASE/../../../.." 2>/dev/null && pwd)" || exit 0
AGENTDB_DIR="$NM_ROOT/agentdb"

# Skip if agentdb not installed
[ -d "$AGENTDB_DIR" ] || exit 0

# Check current version
CURRENT_VERSION=$(node -e "console.log(require('$AGENTDB_DIR/package.json').version)" 2>/dev/null || echo "unknown")
if [[ "$CURRENT_VERSION" == 3.* ]]; then
    echo "  WM-008: agentdb already at v$CURRENT_VERSION (skip)"
    exit 0
fi

echo "  WM-008: Upgrading agentdb from v$CURRENT_VERSION to 3.0.0-alpha.3..."

# Pack v3 into a tarball
WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

(cd "$WORK" && npm pack agentdb@3.0.0-alpha.3 --silent 2>/dev/null) || {
    echo "  WM-008: WARN -- npm pack failed (offline?), skipping agentdb upgrade"
    exit 0
}

TARBALL=$(ls "$WORK"/agentdb-*.tgz 2>/dev/null | head -1)
if [ -z "$TARBALL" ]; then
    echo "  WM-008: WARN -- tarball not found, skipping"
    exit 0
fi

# Remove old, extract new
rm -rf "$AGENTDB_DIR"
mkdir -p "$AGENTDB_DIR"
tar xzf "$TARBALL" -C "$AGENTDB_DIR" --strip-components=1

echo "  Applied: WM-008 agentdb upgrade to v3.0.0-alpha.3"
