import assert from "node:assert/strict";
import test from "node:test";

const { planFighterMerge } = require("../scripts/fighter-merge-plan.js");

const duplicate = { id: "dup", slug: "jose-souza", espnId: null, record: "", photoUrl: null };
const canonical = { id: "canon", slug: "jose-henrique", espnId: "5080485", record: "10-1-0", photoUrl: "/media/fighters/jose-henrique.webp" };

function fight(overrides: Record<string, unknown>) {
  return {
    id: "f",
    slug: null,
    eventId: "event-1",
    status: "completed",
    resultType: "win",
    winnerFighterId: null,
    method: "KO/TKO",
    resultRound: 1,
    resultTime: "4:16",
    fighterAId: "parsons",
    fighterBId: "dup",
    hasPrediction: false,
    ...overrides
  };
}

const plan = (input: Record<string, unknown>) =>
  planFighterMerge({ duplicate, canonical, duplicateFights: [], canonicalFights: [], expectedEspnId: "5080485", ...input });

test("a duplicate's fight without a twin is re-pointed to the full profile", () => {
  const result = plan({ duplicateFights: [fight({ id: "f1", slug: "jonny-parsons-vs-jose-souza", hasPrediction: true })] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.actions, [{ type: "repoint", fightId: "f1", fightSlug: "jonny-parsons-vs-jose-souza" }]);
  assert.equal(result.setEspnId, null);
});

test("a scheduled fight with a prediction absorbs the completed twin and takes its result", () => {
  const result = plan({
    duplicateFights: [fight({ id: "f1", slug: "jonny-parsons-vs-jose-souza", status: "scheduled", resultType: null, method: null, resultRound: null, resultTime: null, hasPrediction: true })],
    canonicalFights: [fight({ id: "twin", fighterBId: "canon", winnerFighterId: "canon" })]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.actions, [
    {
      type: "absorb",
      fightId: "f1",
      fightSlug: "jonny-parsons-vs-jose-souza",
      deleteFightId: "twin",
      deleteFightSlug: null,
      result: { status: "completed", resultType: "win", winnerFighterId: "canon", method: "KO/TKO", resultRound: 1, resultTime: "4:16" }
    }
  ]);
});

test("without a prediction the full profile's own fight wins and the duplicate's copy is dropped", () => {
  const result = plan({
    duplicateFights: [fight({ id: "f1" })],
    canonicalFights: [fight({ id: "twin", slug: "jonny-parsons-vs-jose-henrique", fighterBId: "canon" })]
  });
  assert.deepEqual(result.actions, [
    { type: "drop", fightId: "f1", fightSlug: null, keepFightId: "twin", keepFightSlug: "jonny-parsons-vs-jose-henrique" }
  ]);
});

test("a fight in another event or against another opponent is not treated as a twin", () => {
  const result = plan({
    duplicateFights: [fight({ id: "f1" })],
    canonicalFights: [fight({ id: "other-event", eventId: "event-2", fighterBId: "canon" }), fight({ id: "other-opponent", fighterAId: "someone", fighterBId: "canon" })]
  });
  assert.deepEqual(result.actions, [{ type: "repoint", fightId: "f1", fightSlug: null }]);
});

test("the merge is refused when it could lose data or the pair is not the expected one", () => {
  assert.match(plan({ duplicate: null }).reason, /дубль не найден/);
  assert.match(plan({ canonical: null }).reason, /полный профиль не найден/);
  assert.match(plan({ duplicate: { ...duplicate, record: "10-1-0" } }).reason, /дубль не пустой/);
  assert.match(plan({ duplicate: { ...duplicate, photoUrl: "/media/fighters/jose-souza.webp" } }).reason, /дубль не пустой/);
  assert.match(plan({ canonical: { ...canonical, record: "" } }).reason, /нет рекорда/);
  assert.match(plan({ canonical: { ...canonical, espnId: "1" } }).reason, /не привязана к ESPN 5080485/);
  assert.match(
    plan({
      duplicateFights: [fight({ id: "f1", hasPrediction: true })],
      canonicalFights: [fight({ id: "twin", fighterBId: "canon", hasPrediction: true })]
    }).reason,
    /прогноз есть и у боя дубля/
  );
  assert.match(plan({ duplicateFights: [fight({ id: "f1", fighterAId: "canon" })] }).reason, /соперником полного профиля/);
});

test("the ESPN id held by the duplicate moves to the full profile", () => {
  const result = plan({ duplicate: { ...duplicate, espnId: "5080485" }, canonical: { ...canonical, espnId: null } });
  assert.equal(result.ok, true);
  assert.equal(result.setEspnId, "5080485");
});
