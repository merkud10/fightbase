import assert from "node:assert/strict";
import test from "node:test";

import { buildBreadcrumbJsonLd, buildSportsEventJsonLd, buildWebSiteJsonLd } from "../lib/structured-data";

const baseInput = {
  name: "UFC 330",
  url: "https://fightbase.ru/ru/events/ufc-330",
  description: "Турнир UFC.",
  date: new Date("2026-08-16T00:00:00.000Z"),
  status: "upcoming",
  promotionName: "UFC",
  siteOrigin: "https://fightbase.ru"
};

test("buildSportsEventJsonLd omits location when venue and city are TBD placeholders", () => {
  const jsonLd = buildSportsEventJsonLd({ ...baseInput, venue: "TBD", city: "TBD" }) as Record<string, unknown>;
  assert.equal("location" in jsonLd, false);
});

test("buildSportsEventJsonLd keeps known location parts and drops TBD ones", () => {
  const full = buildSportsEventJsonLd({
    ...baseInput,
    venue: "Xfinity Mobile Arena",
    city: "Philadelphia, United States"
  }) as { location?: { name?: string; address?: string } };
  assert.equal(full.location?.name, "Xfinity Mobile Arena");
  assert.equal(full.location?.address, "Philadelphia, United States");

  const partial = buildSportsEventJsonLd({ ...baseInput, venue: "TBD", city: "Philadelphia, United States" }) as {
    location?: { name?: string; address?: string };
  };
  assert.equal(partial.location?.address, "Philadelphia, United States");
  assert.equal("name" in (partial.location ?? {}), false);
});

test("buildBreadcrumbJsonLd нумерует позиции с единицы и сохраняет порядок", () => {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Главная", url: "https://fightbase.ru/ru" },
    { name: "Новости", url: "https://fightbase.ru/ru/news" }
  ]) as { "@type": string; itemListElement: Array<Record<string, unknown>> };

  assert.equal(jsonLd["@type"], "BreadcrumbList");
  assert.deepEqual(jsonLd.itemListElement, [
    { "@type": "ListItem", position: 1, name: "Главная", item: "https://fightbase.ru/ru" },
    { "@type": "ListItem", position: 2, name: "Новости", item: "https://fightbase.ru/ru/news" }
  ]);
});

test("buildBreadcrumbJsonLd отбрасывает крошки без имени", () => {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Главная", url: "https://fightbase.ru/ru" },
    { name: "   ", url: "https://fightbase.ru/ru/news" },
    { name: "UFC 330", url: "https://fightbase.ru/ru/events/ufc-330" }
  ]) as { itemListElement: Array<{ position: number; name: string }> };

  assert.equal(jsonLd.itemListElement.length, 2);
  assert.deepEqual(
    jsonLd.itemListElement.map((item) => item.position),
    [1, 2]
  );
  assert.equal(jsonLd.itemListElement[1]?.name, "UFC 330");
});

test("buildWebSiteJsonLd объявляет SearchAction на страницу поиска", () => {
  const jsonLd = buildWebSiteJsonLd("https://fightbase.ru") as {
    "@type": string;
    url: string;
    inLanguage: string;
    publisher: Record<string, unknown>;
    potentialAction: { "@type": string; target: { urlTemplate: string }; "query-input": string };
  };

  assert.equal(jsonLd["@type"], "WebSite");
  assert.equal(jsonLd.url, "https://fightbase.ru/ru");
  assert.equal(jsonLd.inLanguage, "ru-RU");
  assert.deepEqual(jsonLd.publisher, { "@type": "Organization", name: "FightBase Media" });
  assert.equal(jsonLd.potentialAction["@type"], "SearchAction");
  assert.equal(jsonLd.potentialAction.target.urlTemplate, "https://fightbase.ru/ru/search?q={search_term_string}");
  assert.equal(jsonLd.potentialAction["query-input"], "required name=search_term_string");
});
