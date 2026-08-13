import assert from "node:assert/strict";
import test from "node:test";

import { buildPageMetadata } from "../lib/page-metadata";
import { DEFAULT_OG_IMAGE_PATH, ogImageUrl } from "../lib/seo";

test("buildPageMetadata creates localized canonical and social metadata", () => {
  const metadata = buildPageMetadata({
    locale: "ru",
    path: "/about",
    title: "О FightBase Media",
    description: "Описание страницы"
  });
  const image = ogImageUrl();

  assert.equal(metadata.title, "О FightBase Media");
  assert.equal(metadata.description, "Описание страницы");
  assert.equal(metadata.alternates?.canonical, "/ru/about");
  assert.deepEqual(metadata.alternates?.languages, {
    "ru-RU": "/ru/about",
    "x-default": "/ru/about"
  });
  assert.deepEqual(metadata.openGraph, {
    type: "website",
    locale: "ru_RU",
    url: "/ru/about",
    siteName: "FightBase Media",
    title: "О FightBase Media",
    description: "Описание страницы",
    images: [image]
  });
  assert.deepEqual(metadata.twitter, {
    card: "summary_large_image",
    title: "О FightBase Media",
    description: "Описание страницы",
    images: [image]
  });
  assert.ok(image.endsWith(DEFAULT_OG_IMAGE_PATH));
});

test("buildPageMetadata localizes an English page URL", () => {
  const metadata = buildPageMetadata({
    locale: "en",
    path: "/terms",
    title: "Terms of use",
    description: "Terms description"
  });

  assert.equal(metadata.alternates?.canonical, "/en/terms");
  assert.equal(metadata.openGraph?.url, "/en/terms");
  assert.equal(metadata.openGraph?.locale, "en_US");
});
