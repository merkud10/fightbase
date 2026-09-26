// A temporary per-run circuit. A later cron run always starts with a clean slate.
function createSourceCircuitBreaker(threshold = 3) {
  const failures = new Map();
  return {
    isOpen(host) { return (failures.get(host) || 0) >= threshold; },
    failed(host) { failures.set(host, (failures.get(host) || 0) + 1); },
    succeeded(host) { failures.delete(host); }
  };
}
module.exports = { createSourceCircuitBreaker };
