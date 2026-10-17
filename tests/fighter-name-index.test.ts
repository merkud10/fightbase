import test from "node:test";
import assert from "node:assert/strict";

import { buildFighterNameIndex, fighterNameKey } from "../lib/fighter-name-index";

test("the name key ignores case, diacritics, suffixes, word order and a leading 'by'", () => {
  assert.equal(fighterNameKey("Dustin Poirier"), fighterNameKey("dustin  poirier"));
  assert.equal(fighterNameKey("Jan Błachowicz"), fighterNameKey("Jan Blachowicz"));
  assert.equal(fighterNameKey("Michael Aswell Jr."), fighterNameKey("Michael Aswell"));
  assert.equal(fighterNameKey("Liu Ce"), fighterNameKey("Ce Liu"));
  assert.equal(fighterNameKey("by Dustin Poirier"), fighterNameKey("Dustin Poirier"));
});

test("the index resolves a unique opponent and refuses an ambiguous key", () => {
  const index = buildFighterNameIndex([
    { slug: "dustin-poirier", name: "Dustin Poirier", nameRu: "Дастин Порье" },
    { slug: "bruno-silva", name: "Bruno Silva", nameRu: "Бруно Силва" },
    { slug: "bruno-silva-2", name: "Bruno Silva", nameRu: "Бруно Силва" }
  ]);
  assert.equal(index.get(fighterNameKey("Dustin Poirier"))?.nameRu, "Дастин Порье");
  assert.equal(index.get(fighterNameKey("Bruno Silva")), null);
  assert.equal(index.get(fighterNameKey("Nobody Here")), undefined);
});
