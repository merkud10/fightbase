import assert from "node:assert/strict";
import test from "node:test";

import { VALUE_EDGE_MIN, expectedValue, resolveValuePick, resolveValueUnits } from "../lib/prediction-value";

const base = { fighterAId: "a", fighterBId: "b" };

test("a heavy favorite is not a value pick when the model agrees with the line", () => {
  // 1.30 / 3.60, модель 72%: 0.72 × 1.30 − 1 = −6%, 0.28 × 3.60 − 1 = +0.8%.
  assert.equal(resolveValuePick({ ...base, aiWinChanceA: 72, oddsAAtPick: 1.3, oddsBAtPick: 3.6 }), null);
});

test("the underdog becomes the value pick when the model rates it above the line", () => {
  const pick = resolveValuePick({ ...base, aiWinChanceA: 62, oddsAAtPick: 1.3, oddsBAtPick: 3.6 });
  assert.equal(pick?.side, "B");
  assert.equal(pick?.fighterId, "b");
  assert.equal(pick?.modelChance, 38);
  assert.ok(Math.abs((pick?.edge ?? 0) - 0.368) < 1e-9);
});

test("the favorite is the value pick when its price is too long for the model", () => {
  const pick = resolveValuePick({ ...base, aiWinChanceA: 65, oddsAAtPick: 1.8, oddsBAtPick: 2.05 });
  assert.equal(pick?.side, "A");
  assert.ok((pick?.edge ?? 0) >= VALUE_EDGE_MIN);
});

test("no value pick without the model estimate or pick-time odds", () => {
  assert.equal(resolveValuePick({ ...base, aiWinChanceA: null, oddsAAtPick: 2, oddsBAtPick: 2 }), null);
  assert.equal(resolveValuePick({ ...base, aiWinChanceA: 60, oddsAAtPick: null, oddsBAtPick: 2 }), null);
  assert.equal(resolveValuePick({ ...base, aiWinChanceA: 0, oddsAAtPick: 2, oddsBAtPick: 2 }), null);
});

test("an edge just under the threshold is not a pick", () => {
  // 0.52 × 2.0 − 1 = +4%.
  assert.equal(resolveValuePick({ ...base, aiWinChanceA: 52, oddsAAtPick: 2, oddsBAtPick: 1.8 }), null);
  assert.equal(expectedValue(0.5, 2), 0);
});

test("value units settle like a 1-unit bet at pick-time odds", () => {
  const pick = resolveValuePick({ ...base, aiWinChanceA: 40, oddsAAtPick: 3, oddsBAtPick: 1.4 });
  assert.equal(pick?.side, "A");
  assert.equal(resolveValueUnits(pick, { status: "completed", resultType: "win", winnerFighterId: "a" }), 2);
  assert.equal(resolveValueUnits(pick, { status: "completed", resultType: "win", winnerFighterId: "b" }), -1);
  assert.equal(resolveValueUnits(pick, { status: "completed", resultType: "draw", winnerFighterId: null }), null);
  assert.equal(resolveValueUnits(pick, { status: "scheduled", resultType: null, winnerFighterId: null }), null);
  assert.equal(resolveValueUnits(null, { status: "completed", resultType: "win", winnerFighterId: "a" }), null);
});
