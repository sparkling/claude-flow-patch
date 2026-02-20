# RS-001: ruv-swarm better-sqlite3 Node 24 compatibility
# GitHub: ruvnet/ruv-FANN#185
#
# ruv-swarm@1.0.20 pins better-sqlite3@^11.6.0 which lacks Node 24
# prebuilt binaries. Bump to ^12.0.0 which supports Node 24 (v137 ABI).
#
# This patch targets the ruv-swarm package.json, NOT @claude-flow/cli.
# Uses RUV_SWARM_ROOT from discover.sh, with glob fallback for backward compat.

import glob

# Prefer RUV_SWARM_ROOT from discover.sh; fall back to glob for standalone use
rs_pkg = ""
if ruv_swarm_root:
    _candidate = os.path.join(ruv_swarm_root, "package.json")
    if os.path.isfile(_candidate):
        rs_pkg = _candidate
if not rs_pkg:
    rs_pkg_candidates = glob.glob(os.path.expanduser(
        "~/.npm/_npx/*/node_modules/ruv-swarm/package.json"
    ))
    rs_pkg = rs_pkg_candidates[0] if rs_pkg_candidates else ""

patch("RS-001: better-sqlite3 ^11 -> ^12 (Node 24)",
    rs_pkg,
    '"better-sqlite3": "^11.6.0"',
    '"better-sqlite3": "^12.0.0"')
