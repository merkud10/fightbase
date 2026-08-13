import test from "node:test";
import assert from "node:assert/strict";

import { getArticleHref, getArticleRouteBase } from "../lib/article-routes";

test("article categories map to their public route", () => {
  assert.equal(getArticleRouteBase("news"), "/news");
  assert.equal(getArticleRouteBase("analysis"), "/analysis");
  assert.equal(getArticleRouteBase("interview"), "/quotes");

  assert.equal(getArticleHref("news", "story"), "/news/story");
  assert.equal(getArticleHref("analysis", "breakdown"), "/analysis/breakdown");
  assert.equal(getArticleHref("interview", "quote"), "/quotes/quote");
});
