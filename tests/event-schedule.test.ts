import test from "node:test";
import assert from "node:assert/strict";

import { buildScheduleRows } from "../lib/event-schedule";

function event(slug: string, date: string, status: string, fights: Array<{ id: string; isMainEvent?: boolean; boutOrder?: number }> = []) {
  return {
    slug,
    status,
    date: new Date(`${date}T00:00:00Z`),
    fights: fights.map((fight) => ({ stage: "main_card", boutOrder: null, isMainEvent: false, ...fight }))
  };
}

test("buildScheduleRows lists upcoming and live events from the nearest, marking the next one", () => {
  const rows = buildScheduleRows([
    event("ufc-334", "2026-11-15", "upcoming"),
    event("ufc-333", "2026-10-24", "completed"),
    event("moicano-nolan", "2026-11-01", "upcoming"),
    event("tonight", "2026-10-31", "live")
  ]);
  assert.deepEqual(
    rows.map((row) => [row.event.slug, row.isNext]),
    [
      ["tonight", true],
      ["moicano-nolan", false],
      ["ufc-334", false]
    ]
  );
});

test("buildScheduleRows picks the main event fight and leaves it empty when the card is not set", () => {
  const rows = buildScheduleRows([
    event("with-card", "2026-11-01", "upcoming", [{ id: "co-main", boutOrder: 2 }, { id: "main", isMainEvent: true, boutOrder: 9 }]),
    event("no-card", "2026-11-08", "upcoming")
  ]);
  assert.equal(rows[0]?.mainFight?.id, "main");
  assert.equal(rows[1]?.mainFight, null);
});

test("buildScheduleRows returns nothing without upcoming events", () => {
  assert.deepEqual(buildScheduleRows([event("ufc-333", "2026-10-24", "completed")]), []);
});
