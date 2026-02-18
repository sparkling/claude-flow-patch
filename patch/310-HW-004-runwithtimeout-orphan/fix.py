# HW-004: runWithTimeout rejects but does not kill child process
# GitHub: #1117

# A: Raise daemon worker timeout above max headless timeout (15 min)
patch("HW-004a: raise worker timeout to 16 min",
    WD,
    """// Worker timeout (5 minutes max per worker)
const DEFAULT_WORKER_TIMEOUT_MS = 5 * 60 * 1000;""",
    """// Worker timeout — must exceed max headless timeout (15 min for audit/refactor)
const DEFAULT_WORKER_TIMEOUT_MS = 16 * 60 * 1000;""")
