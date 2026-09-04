import assert from "node:assert/strict";
import test from "node:test";

import { buildBreadcrumbJsonLd, buildPublisherJsonLd, buildSportsEventJsonLd, buildTrailBreadcrumbJsonLd, buildWebSiteJsonLd } from "../lib/structured-data";

const baseInput = {
  name: "UFC 330",
  url: "https://fightbase.ru/ru/events/ufc-330",
  description: "Турнир UFC.",
  date: new Date("2026-08-16T00:00:00.000Z"),
  status: "upcoming",
  promotionName: "UFC",
  siteOrigin: "https://fightbase.ru"
};

for (const location of [
  { venue: "TBD", city: "TBD" },
  { venue: "", city: "" },
  { venue: "   ", city: "\t" },
  { venue: " tbd ", city: " TbD " },
  { venue: "Meta APEX", city: "TBD" },
  { venue: "Meta APEX", city: "" }
]) {
  test(`buildSportsEventJsonLd omits the event without an address: ${JSON.stringify(location)}`, () => {
    assert.equal(buildSportsEventJsonLd({ ...baseInput, ...location }), null);
  });
}

test("buildSportsEventJsonLd keeps known location parts and drops TBD ones", () => {
  const full = buildSportsEventJsonLd({
    ...baseInput,
    venue: "Xfinity Mobile Arena",
    city: "Philadelphia, United States"
  });
  assert.ok(full);
  assert.equal(full["@type"], "SportsEvent");
  assert.deepEqual(full.location, {
    "@type": "Place",
    name: "Xfinity Mobile Arena",
    address: "Philadelphia, United States"
  });

  const partial = buildSportsEventJsonLd({ ...baseInput, venue: " tbd ", city: " Philadelphia, United States " });
  assert.ok(partial);
  assert.deepEqual(partial.location, {
    "@type": "Place",
    address: "Philadelphia, United States"
  });
});

test("buildSportsEventJsonLd restores event markup after its location is filled", () => {
  const event = { ...baseInput, venue: "TBD", city: "TBD" };
  assert.equal(buildSportsEventJsonLd(event), null);

  const jsonLd = buildSportsEventJsonLd({ ...event, venue: " Meta APEX ", city: "Las Vegas, Nevada, United States" });
  assert.ok(jsonLd);
  assert.equal(jsonLd.name, event.name);
  assert.equal(jsonLd.url, event.url);
  assert.equal(jsonLd.startDate, event.date.toISOString());
  assert.deepEqual(jsonLd.location, {
    "@type": "Place",
    name: "Meta APEX",
    address: "Las Vegas, Nevada, United States"
  });
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

test("buildPublisherJsonLd отдаёт логотип с абсолютным URL и размерами", () => {
  const publisher = buildPublisherJsonLd("https://fightbase.ru") as {
    "@type": string;
    name: string;
    logo: { "@type": string; url: string; width: number; height: number };
  };

  assert.equal(publisher["@type"], "Organization");
  assert.equal(publisher.name, "FightBase Media");
  assert.equal(publisher.logo["@type"], "ImageObject");
  assert.equal(publisher.logo.url, "https://fightbase.ru/gorilla-crown-logo.png");
  assert.equal(publisher.logo.width, 1024);
  assert.equal(publisher.logo.height, 1024);
});

test("buildTrailBreadcrumbJsonLd строит абсолютные ссылки и подставляет текущий URL последней крошке", () => {
  const jsonLd = buildTrailBreadcrumbJsonLd(
    [
      { label: "Главная", href: "/" },
      { label: "Новости", href: "/news" },
      { label: "UFC 330" }
    ],
    { locale: "ru", siteUrl: "https://fightbase.ru", currentUrl: "https://fightbase.ru/ru/news/ufc-330" }
  ) as { itemListElement: Array<{ name: string; item: string }> };

  assert.deepEqual(
    jsonLd.itemListElement.map((entry) => entry.item),
    ["https://fightbase.ru/ru", "https://fightbase.ru/ru/news", "https://fightbase.ru/ru/news/ufc-330"]
  );
});

test("buildTrailBreadcrumbJsonLd не сдваивает слэш, когда siteUrl — объект URL", () => {
  const jsonLd = buildTrailBreadcrumbJsonLd(
    [{ label: "Главная", href: "/" }, { label: "Новости" }],
    { locale: "ru", siteUrl: new URL("https://fightbase.ru"), currentUrl: "https://fightbase.ru/ru/news" }
  ) as { itemListElement: Array<{ item: string }> };

  assert.equal(jsonLd.itemListElement[0]?.item, "https://fightbase.ru/ru");
});
