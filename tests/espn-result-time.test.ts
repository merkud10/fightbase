import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseResultTime } = require("../scripts/espn-result-time.js");
const final = (clock: unknown, displayClock?: string) => ({ status: { clock, displayClock, type: { completed: true } } });

test("verified ESPN final clocks are elapsed time, not a countdown", () => {
  assert.equal(parseResultTime(final(75, "1:15")), "1:15");
  assert.equal(parseResultTime(final(284, "4:44")), "4:44");
});
test("numeric fallback preserves boundaries without inventing missing time", () => {
  assert.equal(parseResultTime(final(75)), "1:15");
  assert.equal(parseResultTime(final(0)), "0:00");
  assert.equal(parseResultTime(final(300)), "5:00");
  for (const value of [null, undefined, "75", NaN, -1, Infinity, 301]) assert.equal(parseResultTime(final(value)), null);
});
test("valid display time takes priority; malformed data and live clocks are rejected", () => {
  assert.equal(parseResultTime(final(99, "01:15")), "1:15");
  for (const value of ["5:01", "4:99", "Final", "-1:00"]) assert.equal(parseResultTime(final(null, value)), null);
  assert.equal(parseResultTime({ status: { clock: 75, displayClock: "1:15", type: { completed: false } } }), null);
  assert.equal(parseResultTime({}), null);
});

const { repairs, validateRepair } = require("../scripts/repair-pinas-result-times.js");
test("historical repair guards identity and old result, and is idempotent", () => {
  for (const repair of repairs) {
    const fight = { id: repair.id, slug: repair.slug, event: { slug: repair.event }, fighterA: { slug: "damian-pinas" },
      fighterB: { slug: repair.opponent }, status: "completed", resultType: "win", fighterAId: "pinas",
      winnerFighterId: "pinas", resultRound: 1, method: "KO/TKO", resultTime: repair.before };
    assert.equal(validateRepair(fight, repair), "repair");
    assert.equal(validateRepair({ ...fight, resultTime: repair.after }, repair), "already-correct");
    for (const patch of [{ id: "other" }, { resultTime: "2:22" }, { winnerFighterId: "opponent" }, { resultRound: 2 }]) {
      assert.throws(() => validateRepair({ ...fight, ...patch }, repair));
    }
  }
});
