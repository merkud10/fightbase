import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateFight, FIGHT_ID, OLD_SLUG, NEW_SLUG, EVENT_SLUG } = require("../scripts/repair-basharat-garza.js");
const fight = {
  id: FIGHT_ID, slug: OLD_SLUG, event: { slug: EVENT_SLUG }, fighterA: { slug: "farid-basharat" },
  fighterAId: "farid", fighterB: { slug: "pablo-garza", name: "Pablo Garza" },
  status: "completed", winnerFighterId: "farid", predictionSnapshot: null
};

test("only the verified incorrect record can be repaired", () => {
  assert.equal(validateFight(fight), "repair");
  for (const patch of [{ id: "another" }, { event: { slug: "another" } }, { status: "scheduled" },
    { winnerFighterId: "pablo" }, { predictionSnapshot: { id: "published" } },
    { fighterB: { slug: "pablo-garza", name: "Someone Else" } }, { slug: "changed" }]) {
    assert.throws(() => validateFight({ ...fight, ...patch }));
  }
});

test("already-correct records are a no-op", () => {
  assert.equal(validateFight({ ...fight, slug: NEW_SLUG, fighterB: { slug: "john-garza", name: "John Garza" } }), "already-correct");
});

test("name matching never substitutes Pablo for John", () => {
  const { findExactFighterMatch, findFighterByNameKey } = require("../scripts/fighter-name-matching.js");
  const pablo = { id: "pablo", name: "Pablo Garza", slug: "pablo-garza" };
  assert.equal(findExactFighterMatch({ name: "John Garza", slug: "john-garza" }, [pablo]), null);
  assert.equal(findFighterByNameKey("John Garza", [pablo]), null);
});
