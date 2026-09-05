import test from "node:test";
import assert from "node:assert/strict";

import { selectArticleFights, type ArticleFightCandidate } from "../lib/article-fights";

const now = new Date("2026-09-05T12:00:00.000Z");

function fight(overrides: Partial<ArticleFightCandidate> & { id: string }): ArticleFightCandidate {
  return {
    fighterAId: "a",
    fighterBId: "b",
    status: "scheduled",
    eventDate: new Date("2026-09-12T00:00:00.000Z"),
    ...overrides
  };
}

test("selectArticleFights prefers fights where both article fighters meet, then the nearest upcoming", () => {
  const picked = selectArticleFights(
    [
      fight({ id: "one-fighter-soon", fighterAId: "a", fighterBId: "x", eventDate: new Date("2026-09-06T00:00:00.000Z") }),
      fight({ id: "both-later", fighterAId: "a", fighterBId: "b", eventDate: new Date("2026-09-20T00:00:00.000Z") }),
      fight({ id: "one-fighter-later", fighterAId: "y", fighterBId: "b", eventDate: new Date("2026-10-04T00:00:00.000Z") })
    ],
    ["a", "b"],
    now
  );
  assert.deepEqual(picked.map((item) => item.id), ["both-later", "one-fighter-soon", "one-fighter-later"]);
});

test("selectArticleFights keeps recently completed fights after upcoming ones and drops old ones", () => {
  const picked = selectArticleFights(
    [
      fight({ id: "old-completed", status: "completed", eventDate: new Date("2026-08-01T00:00:00.000Z") }),
      fight({ id: "fresh-completed", status: "completed", eventDate: new Date("2026-08-29T00:00:00.000Z") }),
      fight({ id: "upcoming", status: "scheduled", eventDate: new Date("2026-09-12T00:00:00.000Z") })
    ],
    ["a", "b"],
    now
  );
  assert.deepEqual(picked.map((item) => item.id), ["upcoming", "fresh-completed"]);
});

test("selectArticleFights ignores fights without article fighters, cancelled fights and caps the list", () => {
  const picked = selectArticleFights(
    [
      fight({ id: "unrelated", fighterAId: "x", fighterBId: "y" }),
      fight({ id: "cancelled", status: "cancelled" }),
      fight({ id: "f1", eventDate: new Date("2026-09-06T00:00:00.000Z") }),
      fight({ id: "f2", eventDate: new Date("2026-09-07T00:00:00.000Z") }),
      fight({ id: "f3", eventDate: new Date("2026-09-08T00:00:00.000Z") }),
      fight({ id: "f4", eventDate: new Date("2026-09-09T00:00:00.000Z") })
    ],
    ["a", "b"],
    now
  );
  assert.deepEqual(picked.map((item) => item.id), ["f1", "f2", "f3"]);
});
