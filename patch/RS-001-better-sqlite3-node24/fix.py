# RS-001: ruv-swarm better-sqlite3 Node 24 compatibility
# GitHub: ruvnet/ruv-FANN#185
#
# ruv-swarm@1.0.20 pins better-sqlite3@^11.6.0 which lacks Node 24
# prebuilt binaries. Bump to ^12.0.0 which supports Node 24 (v137 ABI).
#
# This patch targets the ruv-swarm package.json in the npx cache,
# NOT @claude-flow/cli. It uses the same patch() infrastructure but
# finds its own target path.

import glob

# Find ruv-swarm package.json in npx cache
rs_pkg_candidates = glob.glob(os.path.expanduser(
    "~/.npm/_npx/*/node_modules/ruv-swarm/package.json"
))
rs_pkg = rs_pkg_candidates[0] if rs_pkg_candidates else ""

patch("RS-001: better-sqlite3 ^11 -> ^12 (Node 24)",
    rs_pkg,
    '"better-sqlite3": "^11.6.0"',
    '"better-sqlite3": "^12.0.0"')
