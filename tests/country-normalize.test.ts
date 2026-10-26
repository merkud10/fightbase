import test from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeCountry } = require("../scripts/fighter-import-utils");

test("normalizeCountry translates the country spellings ESPN and UFC.com send", () => {
  assert.equal(normalizeCountry("USA"), "США");
  assert.equal(normalizeCountry("United States"), "США");
  assert.equal(normalizeCountry("Myanmar"), "Мьянма");
  assert.equal(normalizeCountry("Türkiye"), "Турция");
  assert.equal(normalizeCountry("Bosnia & Herzegovina"), "Босния и Герцеговина");
  assert.equal(normalizeCountry("Democratic Republic of the Congo"), "ДР Конго");
  assert.equal(normalizeCountry("Democratic Republic of Congo"), "ДР Конго");
  assert.equal(normalizeCountry("Scotland"), "Шотландия");
});

test("normalizeCountry keeps Russian names and unknown values as they are", () => {
  assert.equal(normalizeCountry("Россия"), "Россия");
  assert.equal(normalizeCountry("Atlantis"), "Atlantis");
});
