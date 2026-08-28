import assert from "node:assert/strict";
import test from "node:test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  fixRecordInBio,
  fixEnglishRecordInBio,
  fixWeightClassInBio,
  findUnsafeWeightMentions,
  englishArticle
} = require("../scripts/repair-fighter-bio-facts.js");

test("английский рекорд подтягивается к полю", () => {
  const bio = "The official profile lists a 28-1-0 professional record.";
  const { text, changed } = fixEnglishRecordInBio(bio, "29-1-0");

  assert.equal(changed, true);
  assert.equal(text, "The official profile lists a 29-1-0 professional record.");
});

test("артикль пересчитывается при смене числа", () => {
  const { text } = fixEnglishRecordInBio("The official profile lists an 11-2-0 professional record.", "12-2-0");

  assert.match(text, /lists a 12-2-0 professional record/);
});

test("артикль становится an, когда число этого требует", () => {
  const { text } = fixEnglishRecordInBio("The official profile lists a 7-2-0 professional record.", "8-2-0");

  assert.match(text, /lists an 8-2-0 professional record/);
});

test("англ. артикли по числам", () => {
  assert.equal(englishArticle(8), "an");
  assert.equal(englishArticle(11), "an");
  assert.equal(englishArticle(18), "an");
  assert.equal(englishArticle(1), "a");
  assert.equal(englishArticle(12), "a");
  assert.equal(englishArticle(20), "a");
});

test("форма Career record тоже правится", () => {
  const { text } = fixEnglishRecordInBio("Career record: 22-9-0.", "22-10-0");

  assert.match(text, /Career record: 22-10-0/);
});

test("совпадающий английский рекорд не трогается", () => {
  const bio = "The official profile lists a 29-1-0 professional record.";
  const { changed } = fixEnglishRecordInBio(bio, "29-1-0");

  assert.equal(changed, false);
});

test("рекорд цифрами подтягивается к полю записи", () => {
  const bio = "Обладает рекордом 7-2-0 и тренируется в команде Minnesota Top Team.";
  const { text, changed } = fixRecordInBio(bio, "8-2-0");

  assert.equal(changed, true);
  assert.equal(text, "Обладает рекордом 8-2-0 и тренируется в команде Minnesota Top Team.");
});

test("рекорд прописью пересобирается со склонением", () => {
  const bio = "Она имеет профессиональный рекорд 17 побед и 8 поражений, тренируется в The Goat Shed.";
  const { text } = fixRecordInBio(bio, "17-9-0");

  assert.match(text, /17 побед и 9 поражений/);
});

test("склонение единственного числа корректно", () => {
  const { text } = fixRecordInBio("Его рекорд составляет 0 побед и 2 поражения.", "1-1-0");

  assert.match(text, /1 победа и 1 поражение/);
});

test("совпадающий рекорд не трогается", () => {
  const bio = "Имеет профессиональный рекорд 22-9-1, включая 9 побед нокаутом.";
  const { text, changed } = fixRecordInBio(bio, "22-9-1");

  assert.equal(changed, false);
  assert.equal(text, bio);
});

test("числа вне контекста рекорда не переписываются", () => {
  const bio = "Победил в 3-м раунде и провёл 5-2 отрезок в UFC.";
  const { text, changed } = fixRecordInBio(bio, "20-1-0");

  assert.equal(changed, false);
  assert.equal(text, bio);
});

test("вес в настоящем времени приводится к полю записи", () => {
  const bio = "Илия Топурия — американский боец UFC, выступающий в лёгком весе под прозвищем «Матадор».";
  const { text, changed } = fixWeightClassInBio(bio, "Featherweight");

  assert.equal(changed, true);
  assert.match(text, /выступающий в полулёгком весе/);
});

test("женская форма причастия поддержана", () => {
  const bio = "Аманда Нунис — бразильская боец UFC, выступающая в среднем весе.";
  const { text } = fixWeightClassInBio(bio, "Women's Bantamweight");

  assert.match(text, /выступающая в легчайшем весе/);
});

test("шаблонная форма «в категории «X вес»» тоже приводится к полю", () => {
  const bio = "Джалин Тёрнер — профессиональный боец UFC, выступающий в категории «Легкий вес».";
  const { text, changed } = fixWeightClassInBio(bio, "Welterweight");

  assert.equal(changed, true);
  assert.match(text, /в категории «Полусредний вес»/);
});

test("чужие кавычки в категории не трогаются", () => {
  const bio = "Выступает в категории «Открытый вес» по правилам промоушена.";
  const { changed } = fixWeightClassInBio(bio, "Heavyweight");

  assert.equal(changed, false);
});

test("прошедшее время не трогается — боец действительно там выступал", () => {
  const bio = "Ковбой долгое время был ключевой фигурой лёгкого веса UFC и остаётся эталоном.";
  const { text, changed } = fixWeightClassInBio(bio, "Welterweight");

  assert.equal(changed, false);
  assert.equal(text, bio);
});

test("причастие прошедшего времени не трогается", () => {
  const bio = "Боец смешанных единоборств, выступавший в UFC в полусреднем весе.";
  const { text, changed } = fixWeightClassInBio(bio, "Middleweight");

  assert.equal(changed, false);
  assert.equal(text, bio);
});

test("совпадающий вес не трогается, несмотря на разное написание ё", () => {
  const bio = "Боец UFC, выступающий в легком весе.";
  const { changed } = fixWeightClassInBio(bio, "Lightweight");

  assert.equal(changed, false);
});

test("небезопасные упоминания дивизиона попадают в отчёт, а не в правку", () => {
  const bio = "Ковбой долгое время был ключевой фигурой лёгкого веса UFC.";
  const mentions = findUnsafeWeightMentions(bio, "Welterweight");

  assert.ok(mentions.length > 0, "историческое упоминание должно быть замечено");
});

test("правка веса не порождает ложных срабатываний в отчёте", () => {
  const bio = "Боец UFC, выступающий в лёгком весе под прозвищем «Матадор».";
  const fixed = fixWeightClassInBio(bio, "Featherweight");
  const mentions = findUnsafeWeightMentions(fixed.text, "Featherweight");

  assert.deepEqual(mentions, []);
});
