// In completed ESPN MMA competitions clock/displayClock are elapsed time
// within the finishing round, not the remaining countdown.
function parseResultTime(competition) {
  const status = competition?.status;
  if (status?.type?.completed !== true) return null;
  const display = typeof status.displayClock === "string" ? status.displayClock.trim() : "";
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(display);
  if (match) {
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    if (seconds <= 300) return `${Number(match[1])}:${match[2]}`;
  }
  const clock = status.clock;
  if (typeof clock !== "number" || !Number.isFinite(clock) || clock < 0 || clock > 300) return null;
  const seconds = Math.round(clock);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

module.exports = { parseResultTime };
