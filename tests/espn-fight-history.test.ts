import assert from "node:assert/strict";
import test from "node:test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeName, looksLikeSamePerson, buildMonthWindows, parseMethod } = require("../scripts/sync-fight-history-from-espn.js");

test("самостоятельные буквы приводятся к латинице, а не только диакритика", () => {
  assert.equal(normalizeName("Klaudia Syguła"), normalizeName("Klaudia Sygula"));
  assert.equal(normalizeName("Michał Oleksiejczuk"), normalizeName("Michal Oleksiejczuk"));
  assert.equal(normalizeName("Jakub Wikłacz"), normalizeName("Jakub Wiklacz"));
});

test("один человек опознаётся по сокращению имени и опечатке", () => {
  assert.equal(looksLikeSamePerson("Zachary Reese", "Zach Reese"), true);
  assert.equal(looksLikeSamePerson("Cameron Teague", "Cam Teague"), true);
  assert.equal(looksLikeSamePerson("Brogdan Grad", "Bogdan Grad"), true);
  assert.equal(looksLikeSamePerson("Aswell Jr.", "Michael Aswell"), true);
});

test("фамилия с опечаткой в одну-две буквы опознаётся", () => {
  assert.equal(looksLikeSamePerson("Gianni Vasquez", "Gianni Vazquez"), true);
  assert.equal(looksLikeSamePerson("Roman Koplov", "Roman Kopylov"), true);
  assert.equal(looksLikeSamePerson("Nazim Sadkyhov", "Nazim Sadykhov"), true);
  assert.equal(looksLikeSamePerson("Elves Brenner", "Elves Brener"), true);
});

test("короткая фамилия допускает лишь одну замену", () => {
  assert.equal(looksLikeSamePerson("Takashi Soto", "Takashi Sato"), true);
  assert.equal(looksLikeSamePerson("Ivan Kort", "Ivan Kurta"), false);
});

test("девичья фамилия остаётся неразрешимой и не угадывается", () => {
  assert.equal(looksLikeSamePerson("Katlyn Chookagian", "Katlyn Cerminara"), false);
  assert.equal(looksLikeSamePerson("Tecia Torres", "Tecia Pennington"), false);
});

test("непохожие фамилии не склеиваются расстоянием редактирования", () => {
  assert.equal(looksLikeSamePerson("Ribiero", "Christian Leroy Duncan"), false);
  assert.equal(looksLikeSamePerson("Rayanne Amanda", "Rayanne dos Santos"), false);
  assert.equal(looksLikeSamePerson("Jose Silva", "Jose Souza"), false);
});

test("разные бойцы не склеиваются", () => {
  assert.equal(looksLikeSamePerson("Conor McGregor", "Nate Diaz"), false);
  assert.equal(looksLikeSamePerson("via rear-naked choke", "Ketlen Souza"), false);
  assert.equal(looksLikeSamePerson("", "Ketlen Souza"), false);
});

test("совпадение по слишком короткой фамилии не засчитывается", () => {
  assert.equal(looksLikeSamePerson("Jon Li", "Mark Li"), false);
});

test("окна покрывают запрошенное число месяцев без пропусков", () => {
  const windows = buildMonthWindows(12);

  assert.equal(windows.length, 12);
  for (const window of windows) {
    assert.match(window, /^\d{8}-\d{8}$/, `окно ${window} должно быть парой дат`);
  }
});

test("каждое окно начинается первым числом и кончается последним днём месяца", () => {
  for (const window of buildMonthWindows(6)) {
    const [start, end] = window.split("-");
    assert.equal(start.slice(6), "01", `${window}: старт не с первого числа`);

    const year = Number(end.slice(0, 4));
    const month = Number(end.slice(4, 6));
    const day = Number(end.slice(6));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    assert.equal(day, lastDay, `${window}: конец не совпадает с последним днём месяца`);
  }
});

test("окна не повторяются", () => {
  const windows = buildMonthWindows(24);

  assert.equal(new Set(windows).size, windows.length);
});

test("диакритика и регистр не мешают сопоставлению имён", () => {
  assert.equal(normalizeName("Uroš Medić"), normalizeName("Uros Medic"));
  assert.equal(normalizeName("Jiří Procházka"), "jiri prochazka");
  assert.equal(normalizeName("Abdul-Kareem Al-Selwady"), "abdul kareem al selwady");
});

test("метод распознаётся из формулировок ESPN", () => {
  const ko = { details: [{ type: { text: "Unofficial Winner Kotko" } }] };
  const submission = { details: [{ type: { text: "Unofficial Winner Submission" } }] };
  const decision = { details: [{ type: { text: "Decision" } }] };

  assert.equal(parseMethod(ko), "KO/TKO");
  assert.equal(parseMethod(submission), "Сабмишен");
  assert.equal(parseMethod(decision), "Решение судей");
});

test("без details метод остаётся неизвестным, а не выдумывается", () => {
  assert.equal(parseMethod({}), null);
  assert.equal(parseMethod({ details: [{ type: { text: "Fight Over" } }] }), null);
});
