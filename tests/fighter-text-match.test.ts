import assert from "node:assert/strict";
import test from "node:test";

import { dropPrefixShadowedFighters, russianNameStems, textMentionsRussianName } from "../lib/fighter-text-match";
import { normalizeComparableText } from "../lib/pipeline";

const text = (value: string) => normalizeComparableText(value);

test("a single surname does not satisfy both stems of a two-word name", () => {
  // Новость о Гнездицком: менеджер Али Аскаров — не боец Аскар Аскаров.
  const article = text("О подписании соглашения сообщил менеджер Гнездицкого Али Аскаров, представляющий Crown Sports Management.");
  assert.deepEqual(russianNameStems("Аскар Аскаров"), ["аскар", "аскар"]);
  assert.equal(textMentionsRussianName("Аскар Аскаров", article), false);
  assert.equal(textMentionsRussianName("Аскар Аскар", article), false);
});

test("a full name is found in any case form and word order", () => {
  assert.equal(textMentionsRussianName("Аскар Аскаров", text("Бой Аскара Аскарова перенесли на декабрь.")), true);
  assert.equal(textMentionsRussianName("Ислам Махачев", text("Чемпион UFC Махачев: Ислам готов защищать пояс.")), true);
  assert.equal(textMentionsRussianName("Ислам Махачев", text("Об этом Исламу Махачеву сообщили накануне.")), true);
  assert.equal(textMentionsRussianName("Пётр Ян", text("Петр Ян защитил титул.")), false, "короткие слова основ не дают — имя ловят алиасы");
});

test("stems match only at the start of a word and only when the words stand close", () => {
  assert.equal(textMentionsRussianName("Роман Долидзе", text("Грузин Долидзе провёл бой. Его тренер Роман доволен.")), true);
  assert.equal(textMentionsRussianName("Роман Долидзе", text(`Роман вышел первым. ${"слово ".repeat(30)} Долидзе ждал.`)), false);
  // «романтик» начинается с основы «роман», но слово «Долидзе» рядом обязательно.
  assert.equal(textMentionsRussianName("Роман Долидзе", text("Безнадёжный романтик октагона.")), false);
  // Подстрока в середине слова упоминанием не считается.
  assert.equal(textMentionsRussianName("Хабиб", text("Непохабибный текст.")), false);
});

test("a one-word name needs a long stem at the start of a word", () => {
  assert.equal(textMentionsRussianName("Сумудаэржи", text("Сумудаэржи поднялся в рейтинге.")), true);
  assert.equal(textMentionsRussianName("Сумудаэржи", text("Экс-соперник Сумудаэржи.")), true);
  assert.equal(textMentionsRussianName("Алдо", text("Алдо завершил карьеру.")), false);
});

test("a fighter whose name is a prefix of another matched fighter's name is dropped", () => {
  const askar = { name: "Askar Askar", nameRu: "Аскар Аскар" };
  const askarov = { name: "Askar Askarov", nameRu: "Аскар Аскаров" };
  const yan = { name: "Petr Yan", nameRu: "Пётр Ян" };
  assert.deepEqual(dropPrefixShadowedFighters([askar, askarov, yan]), [askarov, yan]);
  assert.deepEqual(dropPrefixShadowedFighters([askar, yan]), [askar, yan]);
});
