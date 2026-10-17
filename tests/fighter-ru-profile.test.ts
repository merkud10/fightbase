import test from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAcceptableRussianBio, isAcceptableRussianName } = require("../scripts/fighter-ru-profile.js");

test("a Cyrillic name with the same number of words is accepted", () => {
  assert.equal(isAcceptableRussianName("Джавад Махджуб", "Javad Mahjoub"), true);
  assert.equal(isAcceptableRussianName("Ю Су Ён", "Suyoung You"), true);
  assert.equal(isAcceptableRussianName("Кай Камака III", "Kai Kamaka III"), false);
  assert.equal(isAcceptableRussianName("Кай Камака", "Kai Kamaka III"), true);
});

test("names with Latin letters, extra words or empty values are rejected", () => {
  assert.equal(isAcceptableRussianName("Javad Mahjoub", "Javad Mahjoub"), false);
  assert.equal(isAcceptableRussianName("Боец UFC Джавад Махджуб из Канады", "Javad Mahjoub"), false);
  assert.equal(isAcceptableRussianName("", "Javad Mahjoub"), false);
  assert.equal(isAcceptableRussianName(null, "Javad Mahjoub"), false);
});

test("a bio must be Russian, mention the fighter and have a sane length", () => {
  const bio =
    "Джавад Махджуб — канадский полутяжеловес с рекордом 5-0, пришедший в UFC без поражений. Все победы он одержал досрочно.";
  assert.equal(isAcceptableRussianBio(bio, "Джавад Махджуб"), true);
  assert.equal(isAcceptableRussianBio("Коротко.", "Джавад Махджуб"), false);
  assert.equal(isAcceptableRussianBio(`${bio} До UFC выступал в Road FC, Cage Warriors и Eagle FC.`, "Джавад Махджуб"), false);
  assert.equal(isAcceptableRussianBio(`${bio} До UFC выступал в Road FC.`, "Джавад Махджуб"), true);
  assert.equal(isAcceptableRussianBio(`${bio} He is a former champion.`, "Джавад Махджуб"), false);
  assert.equal(isAcceptableRussianBio(bio.replaceAll("Махджуб", "Петров"), "Джавад Махджуб"), false);
});

test("source links from web search are stripped out of the bio", () => {
  const { cleanAiBio } = require("../scripts/fighter-ru-profile.js");
  assert.equal(
    cleanAiBio(
      "Джо Кропшот — американец. Завоевал пояс LFA удушающим ([LFA](https://www.lfa.com/x-226/)). Встретится с Ником Кляйном ([UFC](https://www.ufc.com/e), [UFC](https://www.ufc.com/f))."
    ),
    "Джо Кропшот — американец. Завоевал пояс LFA удушающим. Встретится с Ником Кляйном."
  );
  assert.equal(
    cleanAiBio(
      "Джавад Махджуб — тяжеловес. Встретится с Фаглиером. Данные подтверждают [профиль UFC](https://u.com/a) и [карточка](https://c.com/b)."
    ),
    "Джавад Махджуб — тяжеловес. Встретится с Фаглиером."
  );
  assert.equal(
    cleanAiBio("Теодор Берггрен — швед. [Источники: UFC](https://www.ufc.com/athlete/x), [материал](https://www.ufc.com/news/y)."),
    "Теодор Берггрен — швед."
  );
});
