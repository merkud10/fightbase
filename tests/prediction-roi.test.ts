import assert from "node:assert/strict";
import test from "node:test";

import { addToRoiBucket, emptyRoiBucket, formatUnits, resolvePickRoiUnits, roiPercent } from "../lib/prediction-roi";

test("resolvePickRoiUnits pays odds minus stake on a correct pick", () => {
  assert.equal(resolvePickRoiUnits("correct", 6.25), 5.25);
  assert.equal(resolvePickRoiUnits("correct", 1.18), 1.18 - 1);
});

test("resolvePickRoiUnits loses the stake on a wrong pick", () => {
  assert.equal(resolvePickRoiUnits("wrong", 6.25), -1);
});

test("resolvePickRoiUnits skips missing odds and non-results", () => {
  assert.equal(resolvePickRoiUnits("correct", null), null);
  assert.equal(resolvePickRoiUnits("correct", 1), null);
  assert.equal(resolvePickRoiUnits("pending", 2.5), null);
  assert.equal(resolvePickRoiUnits("no_result", 2.5), null);
});

test("roi bucket accumulates staked bets and computes percent", () => {
  const bucket = emptyRoiBucket();
  addToRoiBucket(bucket, 5.25);
  addToRoiBucket(bucket, -1);
  addToRoiBucket(bucket, null);

  assert.equal(bucket.staked, 2);
  assert.equal(bucket.units, 4.25);
  assert.equal(roiPercent(bucket), 213);
  assert.equal(roiPercent(emptyRoiBucket()), null);
});

test("formatUnits renders sign and locale suffix", () => {
  assert.equal(formatUnits(5.331, "ru"), "+5.33 у.е.");
  assert.equal(formatUnits(-1, "ru"), "-1.00 у.е.");
  assert.equal(formatUnits(0.105, "en"), "+0.11 u");
});
