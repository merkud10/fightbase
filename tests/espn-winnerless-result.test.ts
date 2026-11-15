import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { classifyWinnerlessResult, competitionStatusUrl, resolveWinnerlessResults } = require("../scripts/espn-winnerless-result.js");

// Ответы core API ESPN, снятые 16.11.2026 с реальных боёв.
const draw = { result: { id: 269, name: "draw", displayName: "Draw", shortDisplayName: "Draw" } };
const noContest = { result: { id: 277, name: "no-contest", displayName: "No Contest", shortDisplayName: "No Contest" } };
const splitDecision = { result: { id: 262, name: "decision---split", displayName: "Decision - Split", shortDisplayName: "S Dec" } };

test("core status names a draw and a no contest explicitly", () => {
  assert.deepEqual(classifyWinnerlessResult(draw), { resultType: "draw", method: "Draw" });
  assert.deepEqual(classifyWinnerlessResult(noContest), { resultType: "no_contest", method: "No Contest" });
});

test("anything else stays unresolved instead of being guessed", () => {
  for (const status of [splitDecision, {}, null, undefined, { result: null }, { result: { name: "" } }]) {
    assert.equal(classifyWinnerlessResult(status), null);
  }
});

test("status url is built from the scoreboard ids", () => {
  assert.equal(
    competitionStatusUrl("600061400", "401922640"),
    "https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/600061400/competitions/401922640/status"
  );
});

const parsed = (overrides: Record<string, unknown>) => ({
  hasResult: true,
  winnerOrder: null,
  resultType: null,
  method: null,
  espnEventId: "600061400",
  espnCompetitionId: "1",
  ...overrides
});

test("only finished fights without a winner or a result type are looked up", async () => {
  const requested: string[] = [];
  const fights = [
    parsed({ espnCompetitionId: "draw", method: "Submission" }),
    parsed({ espnCompetitionId: "won", winnerOrder: "a", resultType: "win", method: "Decision" }),
    parsed({ espnCompetitionId: "scheduled", hasResult: false }),
    parsed({ espnCompetitionId: "known", resultType: "no_contest", method: "No Contest" }),
    parsed({ espnCompetitionId: null })
  ];

  await resolveWinnerlessResults(fights, async (url: string) => {
    requested.push(url);
    return draw;
  });

  assert.deepEqual(requested, [competitionStatusUrl("600061400", "draw")]);
  assert.deepEqual([fights[0]?.resultType, fights[0]?.method], ["draw", "Draw"]);
  assert.deepEqual([fights[1]?.resultType, fights[1]?.method], ["win", "Decision"]);
  assert.equal(fights[2]?.resultType, null);
});

test("a failed or unhelpful lookup leaves the fight unresolved", async () => {
  const failed = [parsed({})];
  await resolveWinnerlessResults(failed, async () => {
    throw new Error("ESPN API HTTP 503");
  }, () => {});
  assert.deepEqual([failed[0]?.resultType, failed[0]?.method], [null, null]);

  const pending = [parsed({})];
  await resolveWinnerlessResults(pending, async () => ({}));
  assert.deepEqual([pending[0]?.resultType, pending[0]?.method], [null, null]);
});
