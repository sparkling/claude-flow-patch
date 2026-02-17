# 1077: macOS daemon worker scheduling blocked by freemem threshold
# GitHub: #1077

patch("1077a: skip freemem threshold on macOS",
    WD,
    "if (freePercent < this.config.resourceThresholds.minFreeMemoryPercent) {",
    "if (os.platform() !== 'darwin' && freePercent < this.config.resourceThresholds.minFreeMemoryPercent) {")
