# common.py — shared patch infrastructure
# Extracted from apply-patches.sh. Provides patch()/patch_all() + path variables.

import sys, os, re

base = os.environ.get("BASE", "")
if not base or base == "/dev/null":
    base = ""  # No claude-flow/cli, paths will be invalid (patch() will skip gracefully)
services = base + "/services" if base else ""
commands = base + "/commands" if base else ""
memory = base + "/memory" if base else ""

applied = 0
skipped = 0

def patch(label, filepath, old, new):
    global applied, skipped
    if not filepath:
        return  # Skip if path is empty (package not found)
    try:
        with open(filepath, 'r') as f:
            code = f.read()
        if new in code:
            skipped += 1
            return
        if old not in code:
            print(f"  WARN: {label} — pattern not found (code may have changed)")
            return
        code = code.replace(old, new, 1)
        with open(filepath, 'w') as f:
            f.write(code)
        print(f"  Applied: {label}")
        applied += 1
    except FileNotFoundError:
        pass  # Silently skip if file doesn't exist (package not installed)
    except Exception as e:
        print(f"  ERROR: {label} — {e}")

def patch_all(label, filepath, old, new):
    """Replace ALL occurrences"""
    global applied, skipped
    if not filepath:
        return  # Skip if path is empty (package not found)
    try:
        with open(filepath, 'r') as f:
            code = f.read()
        if new in code and old not in code:
            skipped += 1
            return
        if old not in code:
            print(f"  WARN: {label} — pattern not found")
            return
        code = code.replace(old, new)
        with open(filepath, 'w') as f:
            f.write(code)
        print(f"  Applied: {label}")
        applied += 1
    except FileNotFoundError:
        pass  # Silently skip if file doesn't exist (package not installed)
    except Exception as e:
        print(f"  ERROR: {label} — {e}")

# ── Target file paths ──
# These may be empty strings if base is not set (no claude-flow/cli found)
HWE = services + "/headless-worker-executor.js" if services else ""
WD = services + "/worker-daemon.js" if services else ""
DJ = commands + "/daemon.js" if commands else ""
DOC = commands + "/doctor.js" if commands else ""
MI = memory + "/memory-initializer.js" if memory else ""

MCP_MEMORY = base + "/mcp-tools/memory-tools.js" if base else ""
MCP_HOOKS = base + "/mcp-tools/hooks-tools.js" if base else ""
CLI_MEMORY = commands + "/memory.js" if commands else ""
EMB_TOOLS = base + "/mcp-tools/embeddings-tools.js" if base else ""

# Init module
init = base + "/init" if base else ""
SETTINGS_GEN = init + "/settings-generator.js" if init else ""

# RuVector (separate package, path set by patch-all.sh)
ruvector_cli = os.environ.get("RUVECTOR_CLI", "")
