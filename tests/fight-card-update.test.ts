import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { planExistingFightUpdate } = require("../scripts/fight-card-update.js");

// Диас — Алатенгхеили, UFC 334: пик сделан 11.11 при порядке «Диас, Алатенгхеили»,
// 12.11 ESPN переставил бойцов, синк перезаписал fighterAId/fighterBId, и шанс
// бойца A (65%) вместе с текстами «путь к победе» достался не тому бойцу.
const parsed = { stage: "early_prelims", boutOrder: 12, status: "scheduled", fighterAId: "alatengheili", fighterBId: "diaz", eventId: "ufc-334", winnerFighterId: null };

test("an existing fight keeps its stored fighter order", () => {
  const update = planExistingFightUpdate(parsed);
  assert.equal("fighterAId" in update, false);
  assert.equal("fighterBId" in update, false);
  assert.deepEqual(update, { stage: "early_prelims", boutOrder: 12, status: "scheduled", eventId: "ufc-334", winnerFighterId: null });
});

test("the result still follows the fighter, not the corner", () => {
  assert.equal(planExistingFightUpdate({ ...parsed, status: "completed", winnerFighterId: "diaz" }).winnerFighterId, "diaz");
  assert.equal(parsed.fighterAId, "alatengheili");
});
