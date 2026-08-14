import assert from "node:assert/strict";
import test from "node:test";

import { eventNightWindowBounds, isWithinEventNightWindow } from "../lib/event-night";
import { formatCardNightLabel, formatCardTime, hasCardTimes } from "../lib/event-time";

// UFC 330: главный кард 2026-08-16T01:00Z = 04:00 по Москве, ночь на воскресенье.
const MAIN_CARD = new Date("2026-08-16T01:00:00Z");

test("formatCardTime renders Moscow time for ru and UTC for en", () => {
  assert.equal(formatCardTime(MAIN_CARD, "ru"), "04:00");
  assert.equal(formatCardTime(MAIN_CARD, "en"), "01:00");
});

test("formatCardNightLabel says night-of for a Moscow small-hours main card", () => {
  assert.equal(formatCardNightLabel(MAIN_CARD, "ru"), "в ночь на воскресенье, 16 августа");
});

test("formatCardNightLabel keeps a plain weekday for a daytime card", () => {
  // 14:00 по Москве — дневной кард (азиатские турниры).
  const daytime = new Date("2026-08-16T11:00:00Z");
  assert.equal(formatCardNightLabel(daytime, "ru"), "воскресенье, 16 августа");
});

test("formatCardNightLabel formats an English label in UTC", () => {
  assert.equal(formatCardNightLabel(MAIN_CARD, "en"), "Sunday, August 16");
});

test("hasCardTimes detects any present segment", () => {
  assert.equal(hasCardTimes({ earlyPrelimsAt: null, prelimsAt: null, mainCardAt: MAIN_CARD }), true);
  assert.equal(hasCardTimes({ earlyPrelimsAt: null, prelimsAt: null, mainCardAt: null }), false);
  assert.equal(hasCardTimes(null), false);
});

test("isWithinEventNightWindow covers [-6h, +16h] around the event date", () => {
  const eventDate = new Date("2026-08-16T00:00:00Z");

  assert.equal(isWithinEventNightWindow(eventDate, new Date("2026-08-15T17:59:00Z")), false);
  assert.equal(isWithinEventNightWindow(eventDate, new Date("2026-08-15T18:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(eventDate, new Date("2026-08-16T04:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(eventDate, new Date("2026-08-16T16:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(eventDate, new Date("2026-08-16T16:01:00Z")), false);
});

test("eventNightWindowBounds mirrors the window as a date range for queries", () => {
  const now = new Date("2026-08-16T04:00:00Z");
  const { minDate, maxDate } = eventNightWindowBounds(now);

  // Событие с date = полночь UTC 16-го внутри диапазона.
  assert.ok(minDate <= new Date("2026-08-16T00:00:00Z"));
  assert.ok(maxDate >= new Date("2026-08-16T00:00:00Z"));
  assert.equal(minDate.toISOString(), "2026-08-15T12:00:00.000Z");
  assert.equal(maxDate.toISOString(), "2026-08-16T10:00:00.000Z");
});
