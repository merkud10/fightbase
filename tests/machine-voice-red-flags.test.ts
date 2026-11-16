import test from "node:test";
import assert from "node:assert/strict";

import { collectMmaEditorialRedFlags } from "../lib/mma-terminology";

// Фразы из новостей о UFC 334 (15.11.2026), по которым читатель видел пересказ
// машиной: текст сообщал, чего нет в источнике, и подводил итоги канцеляритом.
const machineVoice = [
  "Среди главных впечатлений источник выделяет яркие досрочные развязки.",
  "Однако в представленном сообщении не уточняется, какие конкретно финиши принесли награды.",
  "Конкретных следующих соперников в исходном материале не называют.",
  "Точный прием и время окончания встречи в представленном материале не указаны.",
  "Подтвержденного решения об уходе источник не приводит, поэтому считать их карьеру завершенной оснований нет.",
  "Таким образом, сразу несколько участников турнира завершили вечер с дополнительным денежным поощрением.",
  "Его публичную поддержку нельзя считать обещанием финансовой компенсации."
];

test("sentences that retell the source or hedge are flagged for repair", () => {
  for (const sentence of machineVoice) {
    assert.ok(collectMmaEditorialRedFlags(sentence).includes("machine_voice"), sentence);
  }
});

test("ordinary reporting is not flagged", () => {
  const clean = [
    "Сирил Ган победил Джоша Хокита решением судей и защитил пояс в тяжёлом весе.",
    "«Кевин Холланд явно выиграл бой», — заявил Дэйна Уайт.",
    "Источник в UFC сообщил ESPN, что бой перенесён на декабрь.",
    "Сумма бонусов не раскрывается."
  ];
  for (const sentence of clean) {
    assert.equal(collectMmaEditorialRedFlags(sentence).includes("machine_voice"), false, sentence);
  }
});
