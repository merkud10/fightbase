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

// UFC Paris 05.09.2026: date — полночь UTC 5-го, прелимы 16:00Z, главный кард
// 19:00Z. Европейский вечер целиком лежит после «даты турнира».
const PARIS = {
  date: new Date("2026-09-05T00:00:00Z"),
  earlyPrelimsAt: null,
  prelimsAt: new Date("2026-09-05T16:00:00Z"),
  mainCardAt: new Date("2026-09-05T19:00:00Z")
};

test("isWithinEventNightWindow follows card segment times when they are known", () => {
  // От первого сегмента −3ч до главного карда +6ч.
  assert.equal(isWithinEventNightWindow(PARIS, new Date("2026-09-05T12:59:00Z")), false);
  assert.equal(isWithinEventNightWindow(PARIS, new Date("2026-09-05T13:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(PARIS, new Date("2026-09-05T21:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(PARIS, new Date("2026-09-06T01:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(PARIS, new Date("2026-09-06T01:01:00Z")), false);
});

test("isWithinEventNightWindow starts from the earliest known segment", () => {
  const ufc330 = {
    date: new Date("2026-08-16T00:00:00Z"),
    earlyPrelimsAt: new Date("2026-08-15T21:30:00Z"),
    prelimsAt: new Date("2026-08-15T23:00:00Z"),
    mainCardAt: new Date("2026-08-16T01:00:00Z")
  };

  assert.equal(isWithinEventNightWindow(ufc330, new Date("2026-08-15T18:29:00Z")), false);
  assert.equal(isWithinEventNightWindow(ufc330, new Date("2026-08-15T18:30:00Z")), true);
  assert.equal(isWithinEventNightWindow(ufc330, new Date("2026-08-16T07:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(ufc330, new Date("2026-08-16T07:01:00Z")), false);
});

test("isWithinEventNightWindow falls back to [-6h, +30h] around the date without segments", () => {
  const event = {
    date: new Date("2026-08-16T00:00:00Z"),
    earlyPrelimsAt: null,
    prelimsAt: null,
    mainCardAt: null
  };

  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-15T17:59:00Z")), false);
  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-15T18:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-16T04:00:00Z")), true);
  // Европейский вечерний кард без известных сегментов заканчивается ~23:30Z.
  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-16T23:30:00Z")), true);
  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-17T06:00:00Z")), true);
  assert.equal(isWithinEventNightWindow(event, new Date("2026-08-17T06:01:00Z")), false);
});

test("eventNightWindowBounds is a superset range over date for candidate queries", () => {
  const now = new Date("2026-08-16T04:00:00Z");
  const { minDate, maxDate } = eventNightWindowBounds(now);

  // Событие с date = полночь UTC 16-го внутри диапазона.
  assert.ok(minDate <= new Date("2026-08-16T00:00:00Z"));
  assert.ok(maxDate >= new Date("2026-08-16T00:00:00Z"));
  assert.equal(minDate.toISOString(), "2026-08-14T22:00:00.000Z");
  assert.equal(maxDate.toISOString(), "2026-08-16T16:00:00.000Z");

  // Париж в конце своего окна: date отстоит от now на 25 часов назад.
  const parisEnd = eventNightWindowBounds(new Date("2026-09-06T01:00:00Z"));
  assert.ok(parisEnd.minDate <= PARIS.date);
});
