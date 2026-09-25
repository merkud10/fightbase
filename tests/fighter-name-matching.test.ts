import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

type FighterCandidate = {
  id: string;
  name: string;
  slug: string;
};

type FighterNameMatchingModule = {
  findExactFighterMatch: (
    fighter: { name: string; slug?: string },
    candidates: FighterCandidate[]
  ) => FighterCandidate | null;
  normalizeFighterName: (value: string) => string;
  normalizeFighterSlug: (value: string) => string;
  fighterNameKey: (value: string) => string;
  findFighterByNameKey: (name: string, candidates: FighterCandidate[]) => FighterCandidate | null;
};

const require = createRequire(import.meta.url);
const requireScript = () => require("../scripts/fighter-name-matching.js") as FighterNameMatchingModule;
const { findExactFighterMatch, normalizeFighterName, normalizeFighterSlug } = requireScript();

test("normalizes complete fighter names and slugs", () => {
  assert.equal(normalizeFighterName("  José   Aldo Jr. "), "jose aldo jr");
  assert.equal(normalizeFighterSlug("José Aldo Jr."), "jose-aldo-jr");
});

test("matches an exact normalized full name", () => {
  const joseAldo = { id: "aldo", name: "José Aldo Jr.", slug: "jose-aldo-jr" };

  assert.equal(
    findExactFighterMatch({ name: "Jose Aldo Jr", slug: "legacy-source-slug" }, [joseAldo]),
    joseAldo
  );
});

test("matches an exact normalized slug", () => {
  const candidate = { id: "smith", name: "J. Smith", slug: "jacobe-smith" };

  assert.equal(findExactFighterMatch({ name: "Jacobe Smith", slug: "jacobe-smith" }, [candidate]), candidate);
});

test("does not treat a unique surname match as the same fighter", () => {
  const ashleeEvansSmith = {
    id: "ashlee",
    name: "Ashlee Evans-Smith",
    slug: "ashlee-evans-smith"
  };

  assert.equal(
    findExactFighterMatch({ name: "Jacobe Smith", slug: "jacobe-smith" }, [ashleeEvansSmith]),
    null
  );
});

test("does not accept a candidate merely containing the first and last name", () => {
  const differentSmith = {
    id: "different-smith",
    name: "John Jacobe Michael Smith",
    slug: "john-jacobe-michael-smith"
  };

  assert.equal(
    findExactFighterMatch({ name: "Jacobe Smith", slug: "jacobe-smith" }, [differentSmith]),
    null
  );
});

test("does not choose arbitrarily between duplicate exact full names", () => {
  const duplicateNames = [
    { id: "one", name: "Alex Smith", slug: "alex-smith-2" },
    { id: "two", name: "Alex Smith", slug: "alex-smith-3" }
  ];

  assert.equal(
    findExactFighterMatch({ name: "Alex Smith", slug: "missing-source-slug" }, duplicateNames),
    null
  );
});

test("fighterNameKey склеивает варианты написания одного бойца", () => {
  const { fighterNameKey } = requireScript();
  assert.equal(fighterNameKey("Michael Aswell Jr."), fighterNameKey("Michael Aswell"));
  assert.equal(fighterNameKey("Kai Kamaka III"), fighterNameKey("Kai Kamaka"));
  assert.equal(fighterNameKey("Liu Ce"), fighterNameKey("Ce Liu"));
  assert.equal(fighterNameKey("Jan Błachowicz"), fighterNameKey("Jan Blachowicz"));
  assert.notEqual(fighterNameKey("Sim Kai Xiong"), fighterNameKey("Xiong Jingnan"));
  assert.notEqual(fighterNameKey("Cam Rowston"), fighterNameKey("Cameron Rowston"));
});

test("findFighterByNameKey возвращает бойца только при однозначном совпадении", () => {
  const { findFighterByNameKey } = requireScript();
  const candidates = [
    { id: "1", slug: "michael-aswell", name: "Michael Aswell" },
    { id: "2", slug: "kai-kamaka-iii", name: "Kai Kamaka III" },
    { id: "3", slug: "kai-kamaka-2", name: "Kai Kamaka" }
  ];
  assert.equal(findFighterByNameKey("Michael Aswell Jr.", candidates)?.id, "1");
  assert.equal(findFighterByNameKey("Kai Kamaka", candidates), null);
  assert.equal(findFighterByNameKey("Nobody Here", candidates), null);
});
