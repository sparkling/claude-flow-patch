#!/bin/bash
# Patch sentinel — checks if claude-flow patches are applied
# On session start: detects wipe, auto-reapplies, warns user

MEMORY=$(find ~/.npm/_npx -name "memory-initializer.js" -path "*/memory/*" 2>/dev/null | head -1)
SERVICES=$(find ~/.npm/_npx -name "worker-daemon.js" -path "*/services/*" 2>/dev/null | head -1)

if [ -z "$MEMORY" ] || [ -z "$SERVICES" ]; then
  echo "[PATCHES] WARN: Cannot find claude-flow CLI files"
  exit 0
fi

VERSION=$(grep -o '"version": *"[^"]*"' "$(dirname "$MEMORY")/../../../package.json" 2>/dev/null | head -1 | cut -d'"' -f4)
HWE=$(dirname "$SERVICES")/headless-worker-executor.js
COMMANDS_DIR=$(dirname "$SERVICES")/../commands
MCP_TOOLS_DIR=$(dirname "$MEMORY")/../mcp-tools
INIT_DIR=$(dirname "$MEMORY")/../init
EXECUTOR="$INIT_DIR/executor.js"

# Sentinel checks — one representative grep per patch.
# If ANY check fails, the cache was probably wiped → re-apply all.
#
# HW-001: stdin→ignore in headless-worker-executor.js
# HW-002: result.success check in headless-worker-executor.js
# HW-003: 30-minute interval (ADR-020) in headless-worker-executor.js
# DM-001: appendFileSync import in worker-daemon.js
# DM-002: maxCpuLoad threshold in worker-daemon.js
# DM-003: darwin platform check in worker-daemon.js
# DM-004: loadEmbeddingModel stub in worker-daemon.js
# DM-005: applyTemporalDecay stub in worker-daemon.js
# CF-001: config.yaml support in doctor.js
# CF-002: readYamlConfig function in config.js
# EM-001: embeddings.json config in memory-initializer.js
# EM-002: fix.sh (permissions only — no code sentinel, cannot grep)
# UI-001: learningTimeMs null check in hooks.js
# UI-002: getHNSWIndex in neural.js
# NS-001: "all namespaces" + nsFilter in memory-tools/memory-initializer
# NS-002: "Namespace is required" + "cannot be 'all'" in memory-tools
# NS-003: || 'patterns' typo fix in hooks-tools.js
# GV-001: hnswIndex.entries.delete in memory-initializer.js
# SG-001: SubagentStop + TeammateIdle removed in settings-generator.js
# IN-001: intelligenceContent in executor.js (replaces generateIntelligenceStub inline)
# MM-001: persistPath removed from executor.js (absence check)
# HK-001: stdinData stdin parsing in helpers-generator.js
# RS-001: better-sqlite3 ^12 in ruv-swarm (checked separately)

all_ok=true

check() {
  if ! grep -q "$1" "$2" 2>/dev/null; then
    all_ok=false
  fi
}

# HW — Headless Worker
check "'ignore', 'pipe', 'pipe'" "$HWE"              # HW-001
check "result.success" "$HWE"                          # HW-002
check "30 \* 60 \* 1000" "$HWE"                       # HW-003

# DM — Daemon & Workers
check "appendFileSync" "$SERVICES"                     # DM-001
check "maxCpuLoad" "$SERVICES"                         # DM-002
check "darwin" "$SERVICES"                             # DM-003
check "loadEmbeddingModel" "$SERVICES"                 # DM-004
check "applyTemporalDecay" "$SERVICES"                 # DM-005

# CF — Config & Doctor
check "config.yaml" "$COMMANDS_DIR/doctor.js"          # CF-001
check "readYamlConfig" "$COMMANDS_DIR/config.js"       # CF-002

# EM — Embeddings
check "embeddings.json" "$MEMORY"                      # EM-001
# EM-002: fix.sh (permissions only — no code sentinel)

# UI — Display
check "learningTimeMs != null" "$COMMANDS_DIR/hooks.js"  # UI-001
check "getHNSWIndex" "$COMMANDS_DIR/neural.js"           # UI-002

# NS — Memory Namespace (order-dependent: 001→002→003)
check "all namespaces" "$MCP_TOOLS_DIR/memory-tools.js"        # NS-001
check "nsFilter" "$MEMORY"                                      # NS-001
check "Namespace is required" "$MCP_TOOLS_DIR/memory-tools.js"  # NS-002
check "cannot be .all." "$MCP_TOOLS_DIR/memory-tools.js"        # NS-002
check "|| 'patterns'" "$MCP_TOOLS_DIR/hooks-tools.js"           # NS-003

# GV — Ghost Vectors
check "hnswIndex.entries.delete" "$MEMORY"             # GV-001 (note: ?. in actual code)

# SG — Settings Generator
check "hooks.SubagentStop" "$INIT_DIR/settings-generator.js"    # SG-001a
check "TeammateIdle removed" "$INIT_DIR/settings-generator.js"  # SG-001a

# IN — Intelligence
check "intelligenceContent" "$EXECUTOR"                    # IN-001

# MM — Memory Management (absence check: persistPath removed from template)
if grep -q "persistPath: .claude-flow/data" "$EXECUTOR" 2>/dev/null; then
  all_ok=false  # MM-001 not applied — persistPath still in template
fi

# HK — Hooks
check "stdinData" "$INIT_DIR/helpers-generator.js"     # HK-001

# GV-001 uses optional chaining so check more broadly
if ! grep -q "hnswIndex" "$MEMORY" 2>/dev/null; then
  # If even hnswIndex isn't there, something is very wrong
  all_ok=false
fi

# RS — ruv-swarm (separate package, may not be installed)
RS_PKG=$(find ~/.npm/_npx -path "*/ruv-swarm/package.json" 2>/dev/null | head -1)
if [ -n "$RS_PKG" ]; then
  if ! grep -q '"better-sqlite3": "\^12' "$RS_PKG" 2>/dev/null; then
    all_ok=false
  fi
fi

if $all_ok; then
  echo "[PATCHES] OK: All patches verified (v$VERSION)"
  exit 0
fi

# Patches wiped — auto-reapply and warn
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "============================================"
echo "  WARNING: claude-flow patches were wiped!"
echo "  Likely cause: npx cache update (v$VERSION)"
echo "============================================"
echo ""

if [ -x "$SCRIPT_DIR/patch-all.sh" ]; then
  bash "$SCRIPT_DIR/patch-all.sh"
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
