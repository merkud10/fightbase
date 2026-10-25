import test from "node:test";
import assert from "node:assert/strict";

import { buildCardPredictionRows } from "../lib/card-predictions";

function fight(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slug: `${id}-slug` as string | null,
    stage: "main_card",
    boutOrder: null as number | null,
    isMainEvent: false,
    status: "scheduled",
    resultType: null as string | null,
    winnerFighterId: null as string | null,
    fighterAId: `${id}-a`,
    fighterBId: `${id}-b`,
    fighterA: { id: `${id}-a` },
    fighterB: { id: `${id}-b` },
    predictionSnapshot: { aiPickFighterId: `${id}-a`, percentA: 62, percentB: 38 } as
      | { aiPickFighterId: string | null; percentA: number; percentB: number }
      | null,
    ...overrides
  };
}

test("buildCardPredictionRows drops the current fight and keeps card order with the main event first", () => {
  const rows = buildCardPredictionRows(
    [
      fight("prelim", { stage: "prelims", boutOrder: 1 }),
      fight("current", { boutOrder: 2 }),
      fight("co-main", { boutOrder: 3 }),
      fight("main", { isMainEvent: true, boutOrder: 9 })
    ],
    "current"
  );
  assert.deepEqual(rows.map((row) => row.fight.id), ["main", "co-main", "prelim"]);
});

test("buildCardPredictionRows skips fights without a page", () => {
  const rows = buildCardPredictionRows(
    [fight("no-slug", { slug: null }), fight("no-snapshot", { predictionSnapshot: null }), fight("ok")],
    "current"
  );
  assert.deepEqual(rows.map((row) => row.fight.id), ["ok"]);
});

test("buildCardPredictionRows describes an upcoming pick, a pending pick and finished fights", () => {
  const rows = buildCardPredictionRows(
    [
      fight("pick", { boutOrder: 1, predictionSnapshot: { aiPickFighterId: "pick-b", percentA: 45, percentB: 55 } }),
      fight("pending", { boutOrder: 2, predictionSnapshot: { aiPickFighterId: null, percentA: 50, percentB: 50 } }),
      fight("hit", { boutOrder: 3, status: "completed", resultType: "win", winnerFighterId: "hit-a" }),
      fight("miss", { boutOrder: 4, status: "completed", resultType: "win", winnerFighterId: "miss-b" }),
      fight("draw", { boutOrder: 5, status: "completed", resultType: "draw" })
    ],
    "current"
  );
  assert.deepEqual(
    rows.map((row) => row.state),
    [
      { kind: "pick", side: "B", percent: 55 },
      { kind: "pending" },
      { kind: "result", winnerSide: "A", pickVerdict: "correct" },
      { kind: "result", winnerSide: "B", pickVerdict: "wrong" },
      { kind: "winnerless", resultType: "draw" }
    ]
  );
});

test("buildCardPredictionRows returns nothing when the card has no other predictions", () => {
  assert.deepEqual(buildCardPredictionRows([fight("current")], "current"), []);
});
