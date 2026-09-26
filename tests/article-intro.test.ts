import test from "node:test";
import assert from "node:assert/strict";
import { buildArticleExcerpt, prepareArticleIntro } from "../lib/article-intro";
test("a truncated duplicated excerpt becomes a complete lead without losing body text", () => {
  const body = "Первое предложение. Второе предложение.\n\nСледующий абзац.";
  const result = prepareArticleIntro("Первое предложение. Второе пред...", [{ body, id: 1 }]);
  assert.equal(result.lead, "Первое предложение. Второе предложение.");
  assert.equal(result.sections[0]!.body, "Следующий абзац.");
  assert.equal(result.sections[0]!.id, 1);
});
test("an independent editorial lead is preserved", () => {
  const sections = [{ body: "Подробный текст новости." }];
  assert.deepEqual(prepareArticleIntro("Краткий вывод редакции.", sections), { lead: "Краткий вывод редакции.", sections });
});
test("incomplete opening text stays intact in the body", () => {
  const sections = [{ body: "Здесь нет законченного предложения" }];
  assert.deepEqual(prepareArticleIntro("Здесь нет...", sections), { lead: undefined, sections });
});
test("new card excerpts prefer full sentences, otherwise end at a word boundary", () => {
  assert.equal(buildArticleExcerpt("Первый факт. Затем очень длинное объяснение.", 20), "Первый факт.");
  assert.equal(buildArticleExcerpt("Очень длинное предложение без точки", 20), "Очень длинное…");
});
