import test from "node:test";
import assert from "node:assert/strict";

import { getArticleHref, getArticleRouteBase, resolveMovedArticlePath } from "../lib/article-routes";

test("article categories map to their public route", () => {
  assert.equal(getArticleRouteBase("news"), "/news");
  assert.equal(getArticleRouteBase("analysis"), "/analysis");
  assert.equal(getArticleRouteBase("interview"), "/quotes");

  assert.equal(getArticleHref("news", "story"), "/news/story");
  assert.equal(getArticleHref("analysis", "breakdown"), "/analysis/breakdown");
  assert.equal(getArticleHref("interview", "quote"), "/quotes/quote");
});

test("смена рубрики даёт путь для редиректа со старого адреса", () => {
  // Статью перенесли из новостей в разборы: /news/<slug> должен вести на /analysis/<slug>.
  assert.equal(resolveMovedArticlePath("news", "analysis", "breakdown"), "/analysis/breakdown");
  assert.equal(resolveMovedArticlePath("news", "interview", "quote"), "/quotes/quote");
});

test("рубрика на месте — редиректа нет", () => {
  assert.equal(resolveMovedArticlePath("news", "news", "story"), null);
  assert.equal(resolveMovedArticlePath("analysis", "analysis", "breakdown"), null);
});
