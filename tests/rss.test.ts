import assert from "node:assert/strict";
import test from "node:test";

import { buildRssXml, buildZenFeedXml } from "../lib/rss";

const channel = {
  title: "FightBase Media",
  link: "https://fightbase.ru/ru",
  description: "Новости UFC",
  language: "ru",
  selfUrl: "https://fightbase.ru/rss.xml"
};

test("buildRssXml renders channel metadata and items", () => {
  const xml = buildRssXml(channel, [
    {
      title: "Махачев победил",
      link: "https://fightbase.ru/ru/news/makhachev-pobedil",
      description: "Отчет о бое",
      pubDate: new Date("2026-08-13T10:00:00.000Z"),
      category: "Новости"
    }
  ]);

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes("<language>ru</language>"));
  assert.ok(xml.includes('<atom:link href="https://fightbase.ru/rss.xml" rel="self" type="application/rss+xml"/>'));
  assert.ok(xml.includes("<title>Махачев победил</title>"));
  assert.ok(xml.includes("<link>https://fightbase.ru/ru/news/makhachev-pobedil</link>"));
  assert.ok(xml.includes('<guid isPermaLink="true">https://fightbase.ru/ru/news/makhachev-pobedil</guid>'));
  assert.ok(xml.includes("<pubDate>Thu, 13 Aug 2026 10:00:00 GMT</pubDate>"));
  assert.ok(xml.includes("<category>Новости</category>"));
});

test("buildRssXml escapes XML-unsafe characters", () => {
  const xml = buildRssXml(channel, [
    {
      title: 'Уайт: "деньги & слава" <нюанс>',
      link: "https://fightbase.ru/ru/news/test?a=1&b=2",
      description: "1 < 2 & 3 > 2",
      pubDate: new Date("2026-08-13T10:00:00.000Z")
    }
  ]);

  assert.ok(xml.includes("<title>Уайт: &quot;деньги &amp; слава&quot; &lt;нюанс&gt;</title>"));
  assert.ok(xml.includes("<link>https://fightbase.ru/ru/news/test?a=1&amp;b=2</link>"));
  assert.ok(xml.includes("<description>1 &lt; 2 &amp; 3 &gt; 2</description>"));
  assert.ok(!xml.includes("<нюанс>"));
});

test("buildZenFeedXml renders full-text items per Dzen requirements", () => {
  const xml = buildZenFeedXml(channel, [
    {
      title: "Махачев победил",
      link: "https://fightbase.ru/ru/news/makhachev-pobedil",
      pubDate: new Date("2026-08-13T10:00:00.000Z"),
      category: "Новости",
      imageUrl: "https://fightbase.ru/media/articles/cover.jpg",
      htmlBody: "<p>Первый абзац.</p><p>Второй абзац со «кавычками» и &amp; символом.</p>"
    }
  ]);

  assert.ok(xml.includes('xmlns:content="http://purl.org/rss/1.0/modules/content/"'));
  assert.ok(xml.includes('<guid isPermaLink="true">https://fightbase.ru/ru/news/makhachev-pobedil</guid>'));
  assert.ok(xml.includes("<pubDate>Thu, 13 Aug 2026 10:00:00 GMT</pubDate>"));
  assert.ok(xml.includes("<content:encoded><![CDATA[<p>Первый абзац.</p>"));
  assert.ok(xml.includes('<enclosure url="https://fightbase.ru/media/articles/cover.jpg" type="image/jpeg"/>'));
  assert.ok(xml.includes("<category>Новости</category>"));
});

test("buildZenFeedXml escapes CDATA terminators inside the body", () => {
  const xml = buildZenFeedXml(channel, [
    {
      title: "Тест",
      link: "https://fightbase.ru/ru/news/test",
      pubDate: new Date("2026-08-13T10:00:00.000Z"),
      htmlBody: "<p>Опасная строка ]]> внутри</p>"
    }
  ]);

  assert.ok(!xml.includes("]]> внутри"));
  assert.ok(xml.includes("]]]]><![CDATA[>"));
});

test("buildRssXml omits empty optional fields", () => {
  const xml = buildRssXml(channel, [
    {
      title: "Без описания",
      link: "https://fightbase.ru/ru/news/no-desc",
      pubDate: new Date("2026-08-13T10:00:00.000Z")
    }
  ]);

  const itemChunk = xml.slice(xml.indexOf("<item>"));
  assert.ok(!itemChunk.includes("<description>"));
  assert.ok(!itemChunk.includes("<category>"));
});
