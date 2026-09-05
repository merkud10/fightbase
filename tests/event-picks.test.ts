import test from "node:test";
import assert from "node:assert/strict";

import { describeFightPick, summarizeEventPicks } from "../lib/event-picks";

function fight(overrides: Record<string, unknown>) {
  return {
    status: "scheduled",
    resultType: null,
    winnerFighterId: null,
    fighterAId: "a",
    fighterBId: "b",
    fighterA: { id: "a" },
    fighterB: { id: "b" },
    predictionSnapshot: { aiPickFighterId: "a", percentA: 60, percentB: 40 },
    ...overrides
  };
}

test("summarizeEventPicks counts picks, judged fights, hits and called upsets", () => {
  const summary = summarizeEventPicks([
    fight({}),
    fight({ predictionSnapshot: null }),
    fight({ status: "completed", resultType: "win", winnerFighterId: "a" }),
    fight({ status: "completed", resultType: "win", winnerFighterId: "b", predictionSnapshot: { aiPickFighterId: "b", percentA: 70, percentB: 30 } }),
    fight({ status: "completed", resultType: "win", winnerFighterId: "b" }),
    fight({ status: "completed", resultType: "no_contest", winnerFighterId: null })
  ]);
  assert.deepEqual(summary, { fights: 6, withPicks: 5, judged: 3, correct: 2, upsets: 1 });
});

test("describeFightPick returns side, percent and verdict, or null without a pick", () => {
  assert.deepEqual(describeFightPick(fight({})), { side: "A", percent: 60, verdict: "pending" });
  assert.deepEqual(describeFightPick(fight({ status: "completed", resultType: "win", winnerFighterId: "b" })), { side: "A", percent: 60, verdict: "wrong" });
  assert.equal(describeFightPick(fight({ predictionSnapshot: null })), null);
  assert.equal(describeFightPick(fight({ predictionSnapshot: { aiPickFighterId: "zzz", percentA: 50, percentB: 50 } })), null);
});
