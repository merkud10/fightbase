import test from "node:test";
import assert from "node:assert/strict";

import { getPredictionStatsSince, predictionStatsSinceNote } from "../lib/prediction-stats-window";

test("getPredictionStatsSince returns null when the variable is unset or malformed", () => {
  assert.equal(getPredictionStatsSince({}), null);
  assert.equal(getPredictionStatsSince({ PREDICTION_STATS_SINCE: "" }), null);
  assert.equal(getPredictionStatsSince({ PREDICTION_STATS_SINCE: "yesterday" }), null);
  assert.equal(getPredictionStatsSince({ PREDICTION_STATS_SINCE: "2026-13-40" }), null);
});

test("getPredictionStatsSince parses an ISO date as UTC midnight", () => {
  const since = getPredictionStatsSince({ PREDICTION_STATS_SINCE: "2026-09-05" });
  assert.equal(since?.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(getPredictionStatsSince({ PREDICTION_STATS_SINCE: " 2026-09-05 " })?.toISOString(), "2026-09-05T00:00:00.000Z");
});

test("predictionStatsSinceNote names the FightBase AI model, never a vendor model", () => {
  const since = new Date("2026-09-05T00:00:00.000Z");
  const ru = predictionStatsSinceNote(since, "ru") ?? "";
  const en = predictionStatsSinceNote(since, "en") ?? "";
  assert.match(ru, /с 5 сентября 2026 года/);
  assert.match(ru, /ИИ-модель FightBase/);
  assert.match(en, /since September 5, 2026/);
  assert.match(en, /FightBase AI model/);
  for (const text of [ru, en]) {
    assert.doesNotMatch(text, /terra|deepseek|gpt/i);
  }
  assert.equal(predictionStatsSinceNote(null, "ru"), null);
});
