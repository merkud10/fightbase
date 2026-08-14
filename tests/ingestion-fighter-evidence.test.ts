import assert from "node:assert/strict";
import test from "node:test";

import { normalizeComparableText } from "../lib/pipeline";
import { hasFighterTextEvidence } from "../lib/ingestion";

const roganText = normalizeComparableText(
  "Джо Роган раскритиковал систему оплаты в UFC. Комментатор считает, что доход спортсмена не должен так сильно зависеть от результата поединка."
);

test("hasFighterTextEvidence rejects fighters absent from the text (hallucinated slugs)", () => {
  assert.equal(
    hasFighterTextEvidence(
      { slug: "ali-al-qaisi", name: "Ali Al-Qaisi", nameRu: "Али Аль-Каиси", nickname: "The Royal Fighter" },
      roganText
    ),
    false
  );
  assert.equal(
    hasFighterTextEvidence(
      { slug: "jason-macdonald", name: "Jason MacDonald", nameRu: "Джейсон Макдоналд", nickname: "The Athlete" },
      roganText
    ),
    false
  );
});

test("hasFighterTextEvidence confirms fighters mentioned in declined Russian forms", () => {
  const text = normalizeComparableText("Победа Ислама Махачева над соперником укрепила его статус.");
  assert.equal(
    hasFighterTextEvidence({ slug: "islam-makhachev", name: "Islam Makhachev", nameRu: "Ислам Махачев" }, text),
    true
  );

  const yanText = normalizeComparableText("Двалишвили обратился к Петру Яну с призывом о реванше.");
  assert.equal(hasFighterTextEvidence({ slug: "petr-yan", name: "Petr Yan", nameRu: "Пётр Ян" }, yanText), true);
});

test("hasFighterTextEvidence ignores short and generic tokens", () => {
  const text = normalizeComparableText("Бой пройдет в Лас-Вегасе на арене UFC Apex в субботу.");
  assert.equal(hasFighterTextEvidence({ slug: "ben-lee", name: "Ben Lee", nameRu: "Бен Ли" }, text), false);
});

test("hasFighterTextEvidence handles five-letter tokens with case endings", () => {
  const text = normalizeComparableText("Дана Уайт поддержал амбиции Беллы Мир: UFC, Олимпиада и бокс.");
  assert.equal(hasFighterTextEvidence({ slug: "bella-mir", name: "Bella Mir", nameRu: "Белла Мир" }, text), true);
});
