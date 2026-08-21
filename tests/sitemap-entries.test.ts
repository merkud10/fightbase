import assert from "node:assert/strict";
import test from "node:test";

import { getFighterInitials } from "../lib/display";
import { getArticleFreshness, getFighterPriority } from "../lib/sitemap-entries";

const PHOTO = "https://fightbase.ru/media/fighters/abubakar-nurmagomedov-ceefd9b402bb.avif";
const SILHOUETTE = "https://ufc.com/themes/custom/ufc/assets/img/silhouette.png";

test("ушедшие бойцы остаются в карте сайта, но с пониженным приоритетом", () => {
  assert.equal(getFighterPriority("champion", PHOTO), 0.9);
  assert.equal(getFighterPriority("active", PHOTO), 0.8);
  assert.equal(getFighterPriority("prospect", PHOTO), 0.8);
  assert.equal(getFighterPriority("retired", PHOTO), 0.6);
});

test("карточка без пригодного фото теряет 0.1 приоритета, но не выпадает", () => {
  assert.equal(getFighterPriority("active", null), 0.7);
  assert.equal(getFighterPriority("active", SILHOUETTE), 0.7);
  assert.equal(getFighterPriority("retired", ""), 0.5);
});

test("плейсхолдер без фото показывает инициалы вместо пустой заливки", () => {
  assert.equal(getFighterInitials("Мэтт Хоруич"), "МХ");
  assert.equal(getFighterInitials("Abubakar Nurmagomedov"), "AN");
  assert.equal(getFighterInitials("Хабиб"), "Х");
  assert.equal(getFighterInitials("Jose Aldo Junior"), "JA");
  assert.equal(getFighterInitials("Marlon 'Chito' Vera"), "MC");
  assert.equal(getFighterInitials("So-Yul Kim"), "SK");
  assert.equal(getFighterInitials("   "), "");
});

test("свежесть статьи понижает частоту обхода по возрасту", () => {
  const now = Date.parse("2026-08-22T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now - days * 86_400_000);

  assert.deepEqual(getArticleFreshness(daysAgo(1), now), { changeFrequency: "daily", priority: 0.9 });
  assert.deepEqual(getArticleFreshness(daysAgo(14), now), { changeFrequency: "daily", priority: 0.9 });
  assert.deepEqual(getArticleFreshness(daysAgo(30), now), { changeFrequency: "weekly", priority: 0.7 });
  assert.deepEqual(getArticleFreshness(daysAgo(400), now), { changeFrequency: "monthly", priority: 0.5 });
});
