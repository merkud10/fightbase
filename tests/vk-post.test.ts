import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVkArticleUrl,
  buildVkHashtags,
  buildVkLead,
  buildVkPostMessage,
  getVkThrottleReason,
  isResultTitle,
  isVkDuplicate,
  pickVkCandidate,
  stripHashtags,
  VK_LEAD_MAX,
  type VkDedupArticle,
  type VkPostArticle
} from "../lib/vk-post";

const HOUR = 3_600_000;
const BASE = new Date("2026-11-15T06:00:00Z");

function article(overrides: Partial<VkPostArticle> = {}): VkPostArticle {
  return {
    slug: "gane-hokit-ufc-334",
    title: "Сирил Ган защитил титул UFC в бою с Джошем Хокитом",
    excerpt: "Короткое описание.",
    category: "news",
    sections: [
      {
        heading: "Основной раздел",
        body:
          "Сирил Ган победил Джоша Хокита решением судей. Бой возглавил UFC 334 в Нью-Йорке. " +
          "Чемпион выдержал все пять раундов. После боя он вызвал Тома Аспиналла. Пятое предложение лишнее."
      }
    ],
    eventName: "UFC 334",
    ...overrides
  };
}

function dedup(title: string, hoursFromBase: number, fighterIds: string[] = []): VkDedupArticle {
  return { title, publishedAt: new Date(BASE.getTime() + hoursFromBase * HOUR), fighterIds };
}

test("пост — заголовок, пересказ, ссылка с меткой и хэштеги", () => {
  const message = buildVkPostMessage(article(), "https://fightbase.ru");
  const blocks = message.split("\n\n");

  assert.equal(blocks.length, 4);
  assert.equal(blocks[0], "Сирил Ган защитил титул UFC в бою с Джошем Хокитом");
  assert.equal(
    blocks[1],
    "Сирил Ган победил Джоша Хокита решением судей. Бой возглавил UFC 334 в Нью-Йорке. Чемпион выдержал все пять раундов."
  );
  assert.equal(
    blocks[2],
    "Читать полностью: https://fightbase.ru/news/gane-hokit-ufc-334?utm_source=vk&utm_medium=social&utm_campaign=autopost"
  );
  assert.equal(blocks[3], "#UFC334");
});

test("пересказ не длиннее лимита и не рвёт слово", () => {
  const long = `${"Очень длинное предложение без конца ".repeat(30).trim()}.`;
  const lead = buildVkLead(article({ sections: [{ heading: "", body: long }] }));

  assert.ok(lead.length <= VK_LEAD_MAX);
  assert.ok(lead.endsWith("…"));
  assert.ok(!/\s…$/.test(lead));
});

test("длинные предложения: берём столько, сколько влезает", () => {
  const sentence = `${"слово ".repeat(40).trim()}.`; // 240 знаков
  const lead = buildVkLead(article({ sections: [{ heading: "", body: `${sentence} ${sentence} ${sentence}` }] }));

  assert.equal(lead, sentence);
});

test("без текста разделов пересказ берётся из описания", () => {
  assert.equal(buildVkLead(article({ sections: [], excerpt: "Только описание." })), "Только описание.");
});

test("чужие хэштеги вычищаются из текста", () => {
  assert.equal(stripHashtags("Бой пройдёт #january30th в Торонто #UFC ."), "Бой пройдёт в Торонто.");
  const message = buildVkPostMessage(
    article({ sections: [{ heading: "", body: "Смит намекнул на бой #january30th в Торонто." }] }),
    "https://fightbase.ru"
  );
  assert.ok(!message.includes("#january30th"));
});

test("ссылка ведёт в рубрику статьи", () => {
  assert.ok(buildVkArticleUrl("https://fightbase.ru", "analysis", "x").startsWith("https://fightbase.ru/analysis/x?"));
  assert.ok(buildVkArticleUrl("https://fightbase.ru", "interview", "x").startsWith("https://fightbase.ru/quotes/x?"));
});

test("хэштеги: номер турнира, рубрика, прогноз", () => {
  assert.deepEqual(buildVkHashtags({ title: "Новость", category: "news", eventName: "UFC 335" }), ["#UFC335"]);
  assert.deepEqual(buildVkHashtags({ title: "Прогнозы на UFC Vegas 124", category: "news", eventName: null }), [
    "#UFC",
    "#прогноз"
  ]);
  assert.deepEqual(buildVkHashtags({ title: "Как Ган решит судьбу титула", category: "analysis", eventName: null }), [
    "#MMA",
    "#разбор"
  ]);
});

test("итог боя отличается от новости до боя", () => {
  assert.ok(isResultTitle("Харрисон задушила Нуньес на UFC 334 и защитила титул"));
  assert.ok(isResultTitle("Кевин Вальехос победил Алджамейна Стерлинга"));
  assert.ok(!isResultTitle("Коста обещает досрочно победить Гордона на UFC 334"));
  assert.ok(!isResultTitle("Иржи Прохазка встретится с Навахо Стирлингом"));
});

test("второй итог того же боя — дубль", () => {
  const posted = [dedup("Харрисон задушила Нуньес на UFC 334 и защитила титул", 0, ["harrison", "nunes"])];

  assert.ok(isVkDuplicate(dedup("Харрисон задушила Нунес в четвертом раунде и сохранила титул", 1, ["harrison", "nunes"]), posted));
});

test("итог боя после анонса — не дубль", () => {
  const posted = [dedup("Харрисон против Нуньес: чемпионский бой станет соглавным событием UFC 334", 0, ["harrison", "nunes"])];

  assert.ok(!isVkDuplicate(dedup("Харрисон задушила Нуньес на UFC 334", 5, ["harrison", "nunes"]), posted));
});

test("та же пара за пределами окна — не дубль", () => {
  const posted = [dedup("Прохазка встретится со Стирлингом в главном бою", 0, ["prochazka", "stirling"])];

  assert.ok(isVkDuplicate(dedup("Прохазка и Стирлинг возглавят турнир в Катаре", 11, ["prochazka", "stirling"]), posted));
  assert.ok(!isVkDuplicate(dedup("Прохазка и Стирлинг возглавят турнир в Катаре", 13, ["prochazka", "stirling"]), posted));
});

test("один общий боец — не дубль", () => {
  const posted = [dedup("Роган усомнился в габаритах Топурии", 0, ["topuria"])];

  assert.ok(!isVkDuplicate(dedup("Соннен не согласился с Роганом насчёт веса Топурии", 1, ["topuria"]), posted));
});

test("без бойцов дубль ловится по заголовку", () => {
  const posted = [dedup("Иржи Прохазка встретится с Навахо Стирлингом в главном бою UFC Qatar", 0)];

  assert.ok(isVkDuplicate(dedup("Иржи Прохазка встретится с Навахо Стирлингом в главном бою турнира UFC в Катаре", 2), posted));
  assert.ok(!isVkDuplicate(dedup("Том Аспиналл пройдёт новые обследования глаз", 2), posted));
});

test("из очереди берётся самая свежая статья, не повторяющая вышедшее", () => {
  const posted = [dedup("Ган защитил титул в бою с Хокитом", 0, ["gane", "hokit"])];
  const candidates = [
    dedup("Аспиналл пройдёт обследование глаз", 1, ["aspinall"]),
    dedup("Ган победил Хокита решением судей", 3, ["gane", "hokit"]),
    dedup("Майк Перри вернулся в UFC", 2, ["perry"])
  ];

  assert.equal(pickVkCandidate(candidates, posted)?.title, "Майк Перри вернулся в UFC");
  assert.equal(pickVkCandidate(candidates.slice(1, 2), posted), null);
});

test("пауза между постами и дневной лимит", () => {
  const base = { now: BASE, minIntervalMinutes: 180, dailyLimit: 5 };

  assert.equal(getVkThrottleReason({ ...base, lastPostedAt: null, postedToday: 0 }), null);
  assert.equal(getVkThrottleReason({ ...base, lastPostedAt: new Date(BASE.getTime() - 4 * HOUR), postedToday: 4 }), null);
  assert.match(
    getVkThrottleReason({ ...base, lastPostedAt: new Date(BASE.getTime() - HOUR), postedToday: 1 }) ?? "",
    /interval/
  );
  assert.match(
    getVkThrottleReason({ ...base, lastPostedAt: new Date(BASE.getTime() - 4 * HOUR), postedToday: 5 }) ?? "",
    /daily limit/
  );
  // Ноль выключает ограничение.
  assert.equal(
    getVkThrottleReason({ now: BASE, minIntervalMinutes: 0, dailyLimit: 0, lastPostedAt: BASE, postedToday: 99 }),
    null
  );
});
