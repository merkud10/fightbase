import test from "node:test";
import assert from "node:assert/strict";

import { buildResultsHub, isContenderSeries } from "../lib/event-results";

function event(slug: string, date: string, name = `UFC Fight Night: ${slug}`, decided = true) {
  return {
    slug,
    name,
    date: new Date(`${date}T00:00:00Z`),
    fights: [{ status: decided ? "completed" : "scheduled" }]
  };
}

const events = [
  event("dwcs-10", "2026-10-13", "Dana White's Contender Series: Season 10, Week 10"),
  event("ufc-333", "2026-10-24", "UFC 333: Volkanovski vs. Evloev"),
  event("buckley-malott", "2026-10-18"),
  event("allen-duncan", "2026-10-11"),
  event("ufc-332", "2026-10-04", "UFC 332: Silva vs. Wang"),
  event("rosas-barcelos", "2026-09-27"),
  event("dwcs-8", "2026-09-29", "Dana White's Contender Series: Season 10, Week 8")
];

test("isContenderSeries recognises DWCS events only", () => {
  assert.equal(isContenderSeries("Dana White's Contender Series: Season 10, Week 10"), true);
  assert.equal(isContenderSeries("UFC 333: Volkanovski vs. Evloev"), false);
});

test("buildResultsHub puts the newest UFC event first and the next ones after it, skipping DWCS", () => {
  const hub = buildResultsHub(events, { recentCount: 3 });
  assert.equal(hub.latest?.slug, "ufc-333");
  assert.deepEqual(hub.recent.map((item) => item.slug), ["buckley-malott", "allen-duncan", "ufc-332"]);
});

test("buildResultsHub skips an event whose results are not in yet", () => {
  const hub = buildResultsHub([event("tonight", "2026-10-31", "UFC 334: Gane vs. Hokit", false), ...events], { recentCount: 1 });
  assert.equal(hub.latest?.slug, "ufc-333");
});

test("buildResultsHub groups every event, DWCS included, by month from newest", () => {
  const hub = buildResultsHub(events, { recentCount: 3 });
  assert.deepEqual(
    hub.archive.map((month) => [month.key, month.events.map((item) => item.slug)]),
    [
      ["2026-10", ["ufc-333", "buckley-malott", "dwcs-10", "allen-duncan", "ufc-332"]],
      ["2026-09", ["dwcs-8", "rosas-barcelos"]]
    ]
  );
});

test("buildResultsHub handles no completed events", () => {
  const hub = buildResultsHub([], { recentCount: 8 });
  assert.equal(hub.latest, null);
  assert.deepEqual(hub.recent, []);
  assert.deepEqual(hub.archive, []);
});
