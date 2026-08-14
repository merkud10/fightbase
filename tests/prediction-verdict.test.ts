import assert from "node:assert/strict";
import test from "node:test";

import { resolveAiPickVerdict, resolvePredictionVerdict } from "../lib/prediction-verdict";

const base = {
  percentA: 71,
  percentB: 29,
  fighterAId: "fighter-a",
  fighterBId: "fighter-b"
};

test("resolvePredictionVerdict is pending until the fight is completed", () => {
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "scheduled", resultType: null, winnerFighterId: null }),
    "pending"
  );
});

test("resolvePredictionVerdict marks correct and wrong picks by the higher percent", () => {
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "completed", resultType: "win", winnerFighterId: "fighter-a" }),
    "correct"
  );
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "completed", resultType: "win", winnerFighterId: "fighter-b" }),
    "wrong"
  );
  assert.equal(
    resolvePredictionVerdict({
      ...base,
      percentA: 40,
      percentB: 60,
      status: "completed",
      resultType: "win",
      winnerFighterId: "fighter-b"
    }),
    "correct"
  );
});

test("resolveAiPickVerdict judges the stored model pick against the result", () => {
  assert.equal(
    resolveAiPickVerdict({ aiPickFighterId: "fighter-a", status: "scheduled", resultType: null, winnerFighterId: null }),
    "pending"
  );
  assert.equal(
    resolveAiPickVerdict({ aiPickFighterId: null, status: "completed", resultType: "win", winnerFighterId: "fighter-a" }),
    "no_result"
  );
  assert.equal(
    resolveAiPickVerdict({
      aiPickFighterId: "fighter-a",
      status: "completed",
      resultType: "win",
      winnerFighterId: "fighter-a"
    }),
    "correct"
  );
  assert.equal(
    resolveAiPickVerdict({
      aiPickFighterId: "fighter-a",
      status: "completed",
      resultType: "win",
      winnerFighterId: "fighter-b"
    }),
    "wrong"
  );
  assert.equal(
    resolveAiPickVerdict({ aiPickFighterId: "fighter-a", status: "completed", resultType: "draw", winnerFighterId: null }),
    "no_result"
  );
});

test("resolvePredictionVerdict does not judge draws, no-contests and even percents", () => {
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "completed", resultType: "draw", winnerFighterId: null }),
    "no_result"
  );
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "completed", resultType: "no_contest", winnerFighterId: null }),
    "no_result"
  );
  assert.equal(
    resolvePredictionVerdict({ ...base, status: "completed", resultType: "win", winnerFighterId: null }),
    "no_result"
  );
  assert.equal(
    resolvePredictionVerdict({
      ...base,
      percentA: 50,
      percentB: 50,
      status: "completed",
      resultType: "win",
      winnerFighterId: "fighter-a"
    }),
    "no_result"
  );
});
