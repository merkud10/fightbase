import assert from "node:assert/strict";
import test from "node:test";

const { deriveCardTimes, matchEspnEvent, normalizeEventLabel } = require("../scripts/espn-event-utils.js");

test("deriveCardTimes maps three clusters to early prelims, prelims, and main card", () => {
  const result = deriveCardTimes([
    "2026-08-16T01:00Z",
    "2026-08-15T21:30Z",
    "2026-08-15T23:00Z",
    "2026-08-16T01:00Z",
    "2026-08-15T21:30Z"
  ]);

  assert.equal(result.earlyPrelimsAt?.toISOString(), "2026-08-15T21:30:00.000Z");
  assert.equal(result.prelimsAt?.toISOString(), "2026-08-15T23:00:00.000Z");
  assert.equal(result.mainCardAt?.toISOString(), "2026-08-16T01:00:00.000Z");
});

test("deriveCardTimes maps two clusters to prelims and main card", () => {
  const result = deriveCardTimes(["2026-08-15T23:00Z", "2026-08-16T01:00Z", "2026-08-15T23:00Z"]);

  assert.equal(result.earlyPrelimsAt, null);
  assert.equal(result.prelimsAt?.toISOString(), "2026-08-15T23:00:00.000Z");
  assert.equal(result.mainCardAt?.toISOString(), "2026-08-16T01:00:00.000Z");
});

test("deriveCardTimes maps a single cluster to the main card only", () => {
  const result = deriveCardTimes(["2026-08-16T01:00Z"]);

  assert.equal(result.earlyPrelimsAt, null);
  assert.equal(result.prelimsAt, null);
  assert.equal(result.mainCardAt?.toISOString(), "2026-08-16T01:00:00.000Z");
});

test("deriveCardTimes keeps the last two clusters as prelims/main when there are four", () => {
  const result = deriveCardTimes([
    "2026-08-15T20:00Z",
    "2026-08-15T21:30Z",
    "2026-08-15T23:00Z",
    "2026-08-16T01:00Z"
  ]);

  assert.equal(result.earlyPrelimsAt?.toISOString(), "2026-08-15T20:00:00.000Z");
  assert.equal(result.prelimsAt?.toISOString(), "2026-08-15T23:00:00.000Z");
  assert.equal(result.mainCardAt?.toISOString(), "2026-08-16T01:00:00.000Z");
});

test("deriveCardTimes ignores garbage input and returns nulls for an empty list", () => {
  const empty = deriveCardTimes([]);
  assert.deepEqual(empty, { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: null });

  const garbage = deriveCardTimes(["not-a-date", null, undefined]);
  assert.deepEqual(garbage, { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: null });
});

test("matchEspnEvent prefers an exact normalized label match", () => {
  const events = [
    { name: "UFC Fight Night: Someone vs. Other", date: "2026-08-15T21:00Z" },
    { name: "UFC 330: Makhachev vs. Machado Garry", date: "2026-08-15T21:00Z" }
  ];

  const match = matchEspnEvent(events, {
    label: "UFC 330: Makhachev vs Machado Garry",
    date: new Date("2026-08-16T00:00:00Z")
  });

  assert.equal(match?.name, "UFC 330: Makhachev vs. Machado Garry");
});

test("matchEspnEvent falls back to the closest date within 36 hours", () => {
  const events = [
    { name: "Some Other Card", date: "2026-08-08T21:00Z" },
    { name: "Renamed Card", date: "2026-08-15T21:00Z" }
  ];

  const match = matchEspnEvent(events, {
    label: "UFC 330: Makhachev vs. Machado Garry",
    date: new Date("2026-08-16T00:00:00Z")
  });

  assert.equal(match?.name, "Renamed Card");
});

test("matchEspnEvent returns null when nothing is close enough", () => {
  const events = [{ name: "Far Away Card", date: "2026-08-01T21:00Z" }];

  const match = matchEspnEvent(events, {
    label: "UFC 330: Makhachev vs. Machado Garry",
    date: new Date("2026-08-16T00:00:00Z")
  });

  assert.equal(match, null);
});

test("normalizeEventDate anchors the event day to the main card UTC date", () => {
  const { normalizeEventDate } = require("../scripts/espn-event-utils.js");

  // Календарь даёт вечер субботы UTC, главный кард — уже воскресенье UTC.
  const shifted = normalizeEventDate(new Date("2026-08-15T21:00:00Z"), new Date("2026-08-16T01:00:00Z"));
  assert.equal(shifted.toISOString(), "2026-08-16T00:00:00.000Z");

  // Без известного главного карда — усечение календарной даты.
  const plain = normalizeEventDate(new Date("2026-08-16T00:00:00Z"), null);
  assert.equal(plain.toISOString(), "2026-08-16T00:00:00.000Z");

  const evening = normalizeEventDate(new Date("2026-08-15T21:00:00Z"), null);
  assert.equal(evening.toISOString(), "2026-08-15T00:00:00.000Z");
});

test("normalizeEventLabel strips punctuation and case", () => {
  assert.equal(
    normalizeEventLabel("UFC 330: Makhachev vs. Machado Garry"),
    normalizeEventLabel("ufc 330 makhachev vs machado garry")
  );
});
