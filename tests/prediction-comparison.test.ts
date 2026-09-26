import test from "node:test";
import assert from "node:assert/strict";
import { comparePredictions } from "../lib/prediction-comparison";
const base = { modelVerdict: "correct", favoriteVerdict: "wrong", pickUnits: 2, favoriteUnits: -1, pickAgainstOdds: true, lockedBeforeEvent: true };
test("both strategies use identical fight and ROI samples", () => {
  const result = comparePredictions([base, { ...base, pickUnits: null }, { ...base, favoriteVerdict: "unavailable" }, { ...base, lockedBeforeEvent: false }]);
  assert.deepEqual(result.model, { judged: 2, correct: 2 });
  assert.deepEqual(result.favorite, { judged: 2, correct: 0 });
  assert.equal(result.modelRoi.staked, 1);
  assert.equal(result.favoriteRoi.staked, 1);
  assert.equal(result.missingOdds, 1);
  assert.equal(result.excluded, 2);
  assert.equal(result.unverifiedTiming, 1);
});
test("draws and unscored bouts are not counted as losses; segments reconcile", () => {
  const result = comparePredictions([base, { ...base, modelVerdict: "wrong", favoriteVerdict: "wrong", pickAgainstOdds: false, pickUnits: -1 }, { ...base, modelVerdict: "void", favoriteVerdict: "void" }]);
  assert.equal(result.model.judged, 2);
  assert.equal(result.underdogs.judged + result.favorites.judged, 2);
  assert.equal(result.modelRoi.units, 1);
});
