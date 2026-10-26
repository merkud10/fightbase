import test from "node:test";
import assert from "node:assert/strict";

import { getRankingDivisionBySlug } from "../lib/ranking-divisions";
import { buildRussianFightersHub, isRussianFighter } from "../lib/russian-fighters";

function fighter(slug: string, weightClass: string, status = "active", country = "Россия") {
  return { slug, name: slug, nameRu: null, weightClass, status, country };
}

const lightweight = getRankingDivisionBySlug("lightweight")!;
const bantamweight = getRankingDivisionBySlug("bantamweight")!;

test("isRussianFighter trusts the country field except for the manual overrides", () => {
  assert.equal(isRussianFighter(fighter("petr-yan", "Bantamweight")), true);
  assert.equal(isRussianFighter(fighter("nassourdine-imavov", "Middleweight")), false);
  assert.equal(isRussianFighter(fighter("jon-jones", "Heavyweight", "active", "США")), false);
});

test("buildRussianFightersHub groups active fighters by division from flyweight up, women after men", () => {
  const hub = buildRussianFightersHub(
    [
      fighter("rizvan-kuniev", "Heavyweight"),
      fighter("yana-santos", "Women's Bantamweight"),
      fighter("tagir-ulanbekov", "Flyweight"),
      fighter("khabib-nurmagomedov", "Lightweight", "retired"),
      fighter("odd-weight", "Catch Weight")
    ],
    new Map()
  );
  assert.deepEqual(
    hub.divisions.map((group) => [group.division?.slug ?? null, group.fighters.map((item) => item.fighter.slug)]),
    [
      ["flyweight", ["tagir-ulanbekov"]],
      ["heavyweight", ["rizvan-kuniev"]],
      ["womens-bantamweight", ["yana-santos"]],
      [null, ["odd-weight"]]
    ]
  );
  assert.equal(hub.activeCount, 4);
  assert.deepEqual(hub.retired.map((item) => item.slug), ["khabib-nurmagomedov"]);
});

test("buildRussianFightersHub puts champions and ranked fighters first inside a division", () => {
  const hub = buildRussianFightersHub(
    [fighter("unranked", "Bantamweight"), fighter("umar-nurmagomedov", "Bantamweight"), fighter("petr-yan", "Bantamweight")],
    new Map([
      ["petr-yan", { division: bantamweight, rank: null }],
      ["umar-nurmagomedov", { division: bantamweight, rank: 3 }],
      ["islam-makhachev", { division: lightweight, rank: 1 }]
    ])
  );
  assert.deepEqual(hub.divisions[0]?.fighters.map((item) => [item.fighter.slug, item.ranking?.rank ?? "—"]), [
    ["petr-yan", "—"],
    ["umar-nurmagomedov", 3],
    ["unranked", "—"]
  ]);
  assert.equal(hub.divisions[0]?.fighters[0]?.ranking?.rank, null);
  assert.deepEqual(hub.champions.map((item) => item.fighter.slug), ["petr-yan"]);
});
