import assert from "node:assert/strict";
import test from "node:test";

import { segmentFighterMentions } from "../lib/fighter-mentions";

const makhachev = { slug: "islam-makhachev", name: "Islam Makhachev", nameRu: "Ислам Махачев" };
const oliveira = { slug: "charles-oliveira", name: "Charles Oliveira", nameRu: "Чарльз Оливейра" };

test("segmentFighterMentions links the first mention including declined forms", () => {
  const segments = segmentFighterMentions(
    "Победа Ислама Махачева над Чарльзом Оливейрой стала главным событием вечера.",
    [makhachev, oliveira],
    new Set()
  );

  const fighterSegments = segments.filter((segment) => segment.type === "fighter");
  assert.deepEqual(
    fighterSegments.map((segment) => [segment.slug, segment.value]),
    [
      ["islam-makhachev", "Ислама Махачева"],
      ["charles-oliveira", "Чарльзом Оливейрой"]
    ]
  );
  assert.equal(segments.map((segment) => segment.value).join(""), "Победа Ислама Махачева над Чарльзом Оливейрой стала главным событием вечера.");
});

test("segmentFighterMentions links each fighter only once across paragraphs", () => {
  const linked = new Set<string>();
  const first = segmentFighterMentions("Ислам Махачев вышел в клетку.", [makhachev], linked);
  assert.equal(first.filter((segment) => segment.type === "fighter").length, 1);

  const second = segmentFighterMentions("Позже Ислам Махачев дал интервью.", [makhachev], linked);
  assert.equal(second.filter((segment) => segment.type === "fighter").length, 0);
  assert.equal(second.length, 1);
  assert.equal(second[0]?.value, "Позже Ислам Махачев дал интервью.");
});

test("segmentFighterMentions does not fire on partial words or single-name overlaps", () => {
  const segments = segmentFighterMentions(
    "Исламабад не имеет отношения к бою, а махачевская школа — просто слово.",
    [makhachev],
    new Set()
  );
  assert.equal(segments.filter((segment) => segment.type === "fighter").length, 0);
});
