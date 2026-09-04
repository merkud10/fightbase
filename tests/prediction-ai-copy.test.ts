import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildFightFactPack,
  buildPrompt,
  computeAiContentHash,
  generateAiPredictionCopy,
  isPlaceholderFight,
  validateAiCopy
} = require("../scripts/prediction-ai-copy.js");

function makeFighter(overrides = {}) {
  return {
    id: "f-a",
    name: "Islam Makhachev",
    nameRu: "Ислам Махачев",
    record: "28-1-0",
    sigStrikesLandedPerMin: 2.45,
    strikeAccuracy: 58,
    strikeDefense: 62,
    takedownAveragePer15: 3.1,
    takedownDefense: 91,
    submissionAveragePer15: 0.98,
    recentFights: [
      {
        opponentName: "Jack Della Maddalena",
        opponentNameRu: "Джек Делла Маддалена",
        result: "win",
        method: "unanimous decision"
      }
    ],
    ...overrides
  };
}

function makeFight(overrides = {}) {
  return {
    id: "fight-1",
    eventId: "event-1",
    weightClass: "Welterweight",
    isMainEvent: true,
    stage: "main",
    fighterA: makeFighter(),
    fighterB: makeFighter({
      id: "f-b",
      name: "Ian Machado Garry",
      nameRu: "Иан Мачадо Гарри",
      record: "17-1-0",
      recentFights: []
    }),
    event: { name: "UFC 330: Makhachev vs. Machado Garry", date: new Date("2026-08-16T00:00:00Z"), slug: "ufc-330" },
    ...overrides
  };
}

test("buildFightFactPack keeps only filled stats, hides market odds and marks the card slot", () => {
  const pack = buildFightFactPack(makeFight());
  assert.equal(pack.isHeadliner, true);
  assert.equal(pack.fighters[0].name, "Ислам Махачев");
  assert.equal(pack.fighters[0].record, "28-1-0");
  assert.equal(pack.fighters[0].stats.takedownDefense, 91);
  assert.equal(pack.fighters[0].recentFights[0].opponent, "Джек Делла Маддалена");
  assert.equal(pack.fighters[1].recentFights.length, 0);
  // Модель принимает решение вслепую от рынка: котировок в факт-пакете нет.
  assert.equal("percentA" in pack, false);
  assert.equal("percentB" in pack, false);
  assert.equal("percentSource" in pack, false);

  const sparse = buildFightFactPack(
    makeFight({
      fighterA: makeFighter({
        sigStrikesLandedPerMin: null,
        strikeAccuracy: null,
        strikeDefense: null,
        takedownAveragePer15: null,
        takedownDefense: null,
        submissionAveragePer15: null
      })
    })
  );
  assert.deepEqual(sparse.fighters[0].stats, {});
});

function validCopy() {
  return {
    pick: "A",
    pickReason: "Борьба и контроль темпа дают Исламу Махачеву решающее преимущество в этом матчапе.",
    overview:
      "Ислам Махачев подходит к бою фаворитом за счет давления, темпа и борьбы, которая остается его главным оружием на любом отрезке поединка. Иан Мачадо Гарри строит бой от джеба и дистанции, любит контролировать центр клетки и наказывать соперника на выходах. Его шансы напрямую связаны с тем, удастся ли удерживать поединок в стойке достаточно долго и не отдавать спину у сетки.",
    keyEdge:
      "Ключевая разница — борьба и работа у сетки. Преимущество в переводах и контроле позиций остается решающим фактором этого матчапа, потому что в затяжных эпизодах в партере накапливается урон и уходит запас скорости, на котором строится вся игра соперника в стойке.",
    fightScript:
      "Первый раунд скорее всего пройдет в разведке: джеб против попыток сократить дистанцию. Дальше ожидается давление у сетки, размены на входах и регулярные попытки перевода, где и решится судьба поединка. Чем дольше бой идет в чужом ритме, тем тяжелее возвращать инициативу.",
    pathA: "Ранний перевод, контроль в партере, методичное давление до финиша или уверенного решения судей.",
    pathB: "Держать дистанцию, встречать на входах, набирать очки джебом и защищаться от тейкдаунов до поздних раундов."
  };
}

test("buildPrompt asks for strict JSON with a pick and embeds only pack facts", () => {
  const pack = buildFightFactPack(makeFight());
  const prompt = buildPrompt(pack);
  assert.ok(prompt.system.includes("JSON"));
  assert.ok(prompt.system.includes("pick"));
  assert.ok(prompt.user.includes("Ислам Махачев"));
  assert.ok(prompt.user.includes("28-1-0"));
});

test("validateAiCopy accepts a clean copy with a pick", () => {
  const pack = buildFightFactPack(makeFight());
  const result = validateAiCopy(validCopy(), pack);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.pick, "A");
    assert.ok(result.pickReason.includes("Махачеву"));
  }
});

test("validateAiCopy rejects a missing or malformed pick", () => {
  const pack = buildFightFactPack(makeFight());
  assert.equal(validateAiCopy({ ...validCopy(), pick: "C" }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), pick: undefined }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), pickReason: "" }, pack).ok, false);
});

test("validateAiCopy rejects missing fields, latin text, banned lexicon and foreign numbers", () => {
  const pack = buildFightFactPack(makeFight());
  assert.equal(validateAiCopy({ ...validCopy(), pathB: "" }, pack).ok, false);
  assert.equal(
    validateAiCopy(
      { ...validCopy(), overview: "Islam Makhachev is the pressure fighter here and controls every grappling exchange." },
      pack
    ).ok,
    false
  );
  assert.equal(
    validateAiCopy({ ...validCopy(), keyEdge: "Букмекеры дают низкий коэффициент, ставка зайдет." }, pack).ok,
    false
  );
  const foreign = validateAiCopy({ ...validCopy(), keyEdge: "Он выиграл 47 боев подряд и нанес 9999 ударов." }, pack);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, "foreign_numbers");
});

test("validateAiCopy allows round numbers 1-5 and numbers present in the pack", () => {
  const pack = buildFightFactPack(makeFight());
  const copy = {
    ...validCopy(),
    fightScript: "Со 2 раунда Ислам Махачев начнет проводить по 3.1 перевода за счет защиты в 91 процент."
  };
  assert.equal(validateAiCopy(copy, pack).ok, true);
});

function okResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] })
  };
}

test("generateAiPredictionCopy returns validated copy with the model pick on success", async () => {
  const calls: unknown[] = [];
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async (...args: unknown[]) => {
      calls.push(args);
      return okResponse(validCopy());
    }
  });
  assert.equal(result?.copy.overview.startsWith("Ислам Махачев"), true);
  assert.equal(result?.pick, "A");
  assert.ok(result?.pickReason);
  assert.equal(calls.length, 1);
});

test("generateAiPredictionCopy retries HTTP errors and gives up with null", async () => {
  let attempts = 0;
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 500 };
    }
  });
  assert.equal(result, null);
  assert.equal(attempts, 3);
});

test("generateAiPredictionCopy stops after bounded attempts to correct invalid content", async () => {
  let attempts = 0;
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async () => {
      attempts += 1;
      return okResponse({ overview: "" });
    }
  });
  assert.equal(result, null);
  assert.equal(attempts, 3);
});

test("isPlaceholderFight detects TBA/TBD stubs and generation skips them", async () => {
  assert.equal(isPlaceholderFight(makeFight()), false);
  assert.equal(isPlaceholderFight(makeFight({ fighterB: makeFighter({ name: "Opponent TBA", nameRu: null }) })), true);
  assert.equal(isPlaceholderFight(makeFight({ fighterA: makeFighter({ name: "TBD" }) })), true);

  let called = false;
  const result = await generateAiPredictionCopy({
    fight: makeFight({ fighterB: makeFighter({ name: "TBA", nameRu: null }) }),
    percents: { percentA: 50, percentB: 50, source: "base" },
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async () => {
      called = true;
      return okResponse(validCopy());
    }
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("computeAiContentHash is stable within a percent band and reacts to changes", () => {
  const fight = makeFight();
  const h1 = computeAiContentHash(fight, { percentA: 71 });
  const h2 = computeAiContentHash(fight, { percentA: 74 });
  assert.equal(h1, h2);

  const h4 = computeAiContentHash(fight, { percentA: 55 });
  assert.notEqual(h1, h4);

  const h5 = computeAiContentHash(makeFight({ fighterB: makeFighter({ id: "f-c" }) }), { percentA: 71 });
  assert.notEqual(h1, h5);

  const h6 = computeAiContentHash(makeFight({ eventId: "event-2" }), { percentA: 71 });
  assert.notEqual(h1, h6);
});

test("prediction facts and cache react to updated profiles and corrected results", () => {
  const original = makeFight();
  const updated = makeFight({ fighterB: makeFighter({ id: "f-b", age: 28, heightCm: 178, reachCm: 185, team: "Atch Academy", style: "--" }) });
  const facts = buildFightFactPack(updated).fighters[1];
  assert.equal(facts.age, 28);
  assert.equal(facts.heightCm, 178);
  assert.equal(facts.team, "Atch Academy");
  assert.equal(facts.style, null);
  assert.notEqual(computeAiContentHash(original), computeAiContentHash(updated));
  const corrected = makeFight({ fighterA: makeFighter({ recentFights: [{ opponentName: "Jack Della Maddalena", result: "loss", date: new Date("2026-01-31") }] }) });
  assert.notEqual(computeAiContentHash(original), computeAiContentHash(corrected));
  assert.equal(buildFightFactPack(corrected).fighters[0].recentFights[0].date, "2026-01-31");
  assert.equal(buildFightFactPack(makeFight({ isMainEvent: false, stage: "main_card" })).cardSlot, "бой основного карда");
});

test("missing statistics cannot be used as evidence of weakness", () => {
  const pack = buildFightFactPack(makeFight());
  const bad = validateAiCopy({ ...validCopy(), pickReason: "Отсутствие данных о сопернике делает выбор очевидным." }, pack);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "missing_data_bias");
  assert.equal(validateAiCopy({ ...validCopy(), keyEdge: "Отсутствие статистики делает соперника аутсайдером." }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), keyEdge: "Отсутствие статистики не означает слабость соперника." }, pack).reason, "editorial_data_gap");
});

test("published prediction cannot justify a pick with a gap in our data", () => {
  const pack = buildFightFactPack(makeFight());
  for (const text of [
    "Выбор предварительный: у Парнасса нет данных о выступлениях в UFC, поэтому опираемся на известный уровень Хукера и его антропометрию.",
    "Боец выходит без статистики и истории боев в промоушене.",
    "Статистика выступлений отсутствует, поэтому выбор осторожный.",
    "История боев неизвестна редакции."
  ]) {
    assert.equal(validateAiCopy({ ...validCopy(), pickReason: text }, pack).reason, "editorial_data_gap", text);
  }
});

test("verified UFC debut retains career achievements and other promotions' bouts", () => {
  const fight = makeFight({
    fighterB: makeFighter({
      espnId: "4312859", name: "Salahdine Parnasse", nameRu: "Салахдин Парнасс",
      recentFights: [{ opponentName: "Kenneth Cross", eventName: "MVP MMA: Rousey vs. Carano", result: "win", method: "TKO", round: 1, date: new Date("2026-05-16") }]
    }),
    event: { name: "UFC Fight Night: Hooker vs. Parnasse", date: new Date("2026-09-05") }
  });
  const pack = buildFightFactPack(fight);
  assert.equal(pack.fighters[1].career.isUfcDebut, true);
  assert.match(pack.fighters[1].career.achievements[0], /KSW/);
  assert.equal(pack.fighters[1].recentFights[0].eventName, "MVP MMA: Rousey vs. Carano");
  assert.equal(pack.fighters[1].recentFights[0].round, 1);
  assert.equal(validateAiCopy({ ...validCopy(), overview: "Салахдин Парнасс дебютирует в UFC после чемпионской карьеры в KSW." }, pack).ok, true);
  assert.equal(buildFightFactPack({ ...fight, event: { ...fight.event, date: new Date("2026-10-05") } }).fighters[1].career.isUfcDebut, false);
  assert.equal(buildFightFactPack({ ...fight, event: { ...fight.event, date: new Date("2026-05-16") } }).fighters[1].career, null);
  const differentPromotion = { ...fight, event: { ...fight.event, name: "KSW" } };
  assert.equal(buildFightFactPack(differentPromotion).fighters[1].career.isUfcDebut, false);
});

test("empty history does not establish a UFC debut", () => {
  const pack = buildFightFactPack(makeFight());
  assert.equal(pack.fighters[1].career, null);
  assert.equal(validateAiCopy({ ...validCopy(), overview: "Боец дебютирует в UFC и пока только начинает свой путь." }, pack).reason, "unverified_ufc_debut");
});

test("a record without recent results does not prove a winning streak or peak form", () => {
  const pack = buildFightFactPack(makeFight());
  const streak = validateAiCopy({ ...validCopy(), pickReason: "Он идет на серии побед и лучше подготовлен." }, pack);
  assert.equal(streak.ok, false);
  assert.equal(streak.reason, "unsupported_winning_streak");
  assert.equal(validateAiCopy({ ...validCopy(), keyEdge: "Он находится на пике формы." }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), keyEdge: "Он находится в лучшей форме." }, pack).ok, false);
});

test("known Latin athlete names do not count as untranslated prose", () => {
  const pack = buildFightFactPack(makeFight({ fighterA: makeFighter({ nameRu: null, name: "Mehemmedeli Osmanli" }) }));
  assert.equal(validateAiCopy({ ...validCopy(), pathA: "Mehemmedeli Osmanli должен удерживать дистанцию и сохранять темп." }, pack).ok, true);
  assert.equal(validateAiCopy({ ...validCopy(), pathA: "Mehemmedeli Osmanli should keep his distance and maintain a high pace throughout this fight." }, pack).ok, false);
});
