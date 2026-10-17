import test from "node:test";
import assert from "node:assert/strict";

import { buildSitemapXml } from "../lib/sitemap-xml";

test("fresh sitemap lists the newest pages first with escaped urls", () => {
  const xml = buildSitemapXml([
    { url: "https://fightbase.ru/ru/events/ufc-336", lastModified: new Date("2026-10-15T06:00:00Z") },
    { url: "https://fightbase.ru/ru/news/a&b", lastModified: new Date("2026-10-17T09:30:00Z") }
  ]);

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.ok(xml.indexOf("news/a&amp;b") < xml.indexOf("events/ufc-336"));
  assert.match(xml, /<lastmod>2026-10-17T09:30:00.000Z<\/lastmod>/);
  assert.ok(xml.trimEnd().endsWith("</urlset>"));
});

test("an empty fresh sitemap is still a valid urlset", () => {
  assert.match(buildSitemapXml([]), /<urlset[^>]*>\n\n<\/urlset>/);
});
