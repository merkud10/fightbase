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
};

const require = createRequire(import.meta.url);
const { findExactFighterMatch, normalizeFighterName, normalizeFighterSlug } = require(
  "../scripts/fighter-name-matching.js"
) as FighterNameMatchingModule;

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
