import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { isLineFrozen } = require("../scripts/odds-freeze.js");

// UFC 334: ранние прелимы в 22:00 UTC 14.11.2026. Синк в 23:56 записал
// Гордон — Коста 1.71 / 1.89 вместо предматчевых 3.93 / 1.25: бой уже шёл.
const ufc334 = { earlyPrelimsAt: new Date("2026-11-14T22:00:00Z"), prelimsAt: new Date("2026-11-15T00:00:00Z"), mainCardAt: new Date("2026-11-15T02:00:00Z") };

test("line is frozen once the first card segment has started", () => {
  assert.equal(isLineFrozen(ufc334, null, new Date("2026-11-14T20:07:00Z")), false);
  assert.equal(isLineFrozen(ufc334, null, new Date("2026-11-14T22:00:00Z")), true);
  assert.equal(isLineFrozen(ufc334, null, new Date("2026-11-14T23:56:00Z")), true);
});

test("the earliest known segment counts, whichever fields are filled", () => {
  const mainOnly = { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: new Date("2026-10-06T23:00:00Z") };
  assert.equal(isLineFrozen(mainOnly, null, new Date("2026-10-06T22:59:00Z")), false);
  assert.equal(isLineFrozen(mainOnly, null, new Date("2026-10-06T23:18:00Z")), true);
});

test("without segment times the bookmaker start time decides", () => {
  const noSegments = { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: null };
  const now = new Date("2026-11-14T23:56:00Z");
  assert.equal(isLineFrozen(noSegments, { commence_time: "2026-11-14T23:40:00Z" }, now), true);
  assert.equal(isLineFrozen(noSegments, { commence_time: "2026-11-15T02:00:00Z" }, now), false);
  assert.equal(isLineFrozen(noSegments, { commence_time: "not a date" }, now), false);
  assert.equal(isLineFrozen(noSegments, null, now), false);
  assert.equal(isLineFrozen(null, undefined, now), false);
});

test("a bookmaker start time in the past freezes the line even before our card start", () => {
  assert.equal(isLineFrozen(ufc334, { commence_time: "2026-11-14T21:00:00Z" }, new Date("2026-11-14T21:30:00Z")), true);
});
