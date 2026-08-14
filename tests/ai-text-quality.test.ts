import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { collectRedFlags, enforceNameCorrections, latinShare } = require("../scripts/ai-text-quality.js");

test("collectRedFlags detects leftover English MMA terms", () => {
  assert.deepEqual(collectRedFlags("Он выступает в дивизионе featherweight"), ["raw_weight_class_english"]);
  assert.deepEqual(collectRedFlags("Чистый русский текст о бое."), []);
});

test("enforceNameCorrections fixes the known bad name variant", () => {
  assert.equal(enforceNameCorrections("Чрис Кёртис победил"), "Крис Кёртис победил");
});

test("latinShare computes the latin-letter fraction", () => {
  assert.equal(latinShare("абвг"), 0);
  assert.equal(latinShare("abcd"), 1);
  assert.ok(Math.abs(latinShare("абab") - 0.5) < 1e-9);
  assert.equal(latinShare(""), 0);
});
