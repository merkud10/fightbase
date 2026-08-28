import assert from "node:assert/strict";
import test from "node:test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeName, buildMonthWindows, parseMethod } = require("../scripts/sync-fight-history-from-espn.js");

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
