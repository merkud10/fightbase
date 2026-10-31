import test from "node:test";
import assert from "node:assert/strict";
import { resolveFighterHistoryLinks } from "../lib/fighter-history-links";

const entry = { date: new Date("2026-10-24T16:00:00Z"), opponentSlug: "opponent" };
const fight = {
  fighterAId: "self", fighterBId: "other", fighterA: { slug: "self" }, fighterB: { slug: "opponent" },
  status: "completed", slug: "self-vs-opponent",
  event: { slug: "event", date: new Date("2026-10-24T00:00:00Z") }, predictionSnapshot: { id: "snapshot" }
};
const empty = { eventSlug: null, predictionSlug: null };

test("links a completed fight on the same UTC day in either corner", () => {
  const expected = { eventSlug: "event", predictionSlug: "self-vs-opponent" };
  assert.deepEqual(resolveFighterHistoryLinks(entry, "self", [fight]), expected);
  assert.deepEqual(resolveFighterHistoryLinks(entry, "self", [{ ...fight,
    fighterAId: "other", fighterBId: "self", fighterA: fight.fighterB, fighterB: fight.fighterA }]), expected);
});

test("does not link a rematch on another day, another opponent, scheduled fight or unrelated fighter", () => {
  for (const candidate of [
    { ...fight, event: { ...fight.event, date: new Date("2026-10-23T23:00:00Z") } },
    { ...fight, fighterB: { slug: "someone-else" } },
    { ...fight, status: "scheduled" },
    { ...fight, fighterAId: "unrelated" }
  ]) assert.deepEqual(resolveFighterHistoryLinks(entry, "self", [candidate]), empty);
});

test("ambiguous, unresolved and invalid entries have no links", () => {
  assert.deepEqual(resolveFighterHistoryLinks(entry, "self", [fight, fight]), empty);
  assert.deepEqual(resolveFighterHistoryLinks({ ...entry, opponentSlug: null }, "self", [fight]), empty);
  assert.deepEqual(resolveFighterHistoryLinks({ ...entry, date: new Date("invalid") }, "self", [fight]), empty);
});

test("a breakdown requires both a snapshot and a slug; the event remains available", () => {
  for (const candidate of [{ ...fight, predictionSnapshot: null }, { ...fight, slug: null }]) {
    assert.deepEqual(resolveFighterHistoryLinks(entry, "self", [candidate]), { eventSlug: "event", predictionSlug: null });
  }
});
