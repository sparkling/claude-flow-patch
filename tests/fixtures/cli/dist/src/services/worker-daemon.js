// Minimal fixture for DM-002, DM-003, HW-002, HW-003 testing
const config = {
  resourceThresholds: {
    maxCpuLoad: 2.0,
    minFreeMemory: 0.1,
  },
};

if (freePercent < this.config.resourceThresholds.minFreeMemory) {
  return false;
}

const workers = [
  { type: 'audit', intervalMs: 10 * 60 * 1000 },
  { type: 'optimize', intervalMs: 15 * 60 * 1000 },
  { type: 'testgaps', intervalMs: 20 * 60 * 1000 },
];
