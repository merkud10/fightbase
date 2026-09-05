import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { isUsablePhoto } from "../lib/display";

const { enrichFighter, hasUsablePhoto, isProfileIncomplete, needsEspnBackfill, ESPN_FIGHTER_SELECT } = require("../scripts/espn-enrich.js");
const imageStore: { persistImageLocally: (input: unknown) => Promise<string | null> } = require("../scripts/local-image-store.js");
const { parseArgs } = require("../scripts/fighter-import-utils.js");

// Полностью заполненный боец — эталон, от которого отличаются остальные случаи.
function completeFighter() {
  return {
    id: "fighter-1",
    slug: "islam-makhachev",
    name: "Islam Makhachev",
    espnId: "333",
    record: "29-1-0",
    photoUrl: "/media/fighters/islam-makhachev.png",
    heightCm: 178,
    reachCm: 179,
    team: "Eagles MMA",
    age: 34
  };
}

test("needsEspnBackfill не трогает полностью заполненного бойца", () => {
  assert.equal(needsEspnBackfill(completeFighter()), false);
});

test("ESPN и сайт одинаково исключают силуэты, логотипы и флаги из фотографий", () => {
  const placeholders = [
    "/themes/custom/ufc/assets/img/silhouette-headshot-female.png",
    "https://ufc.com/themes/custom/ufc/assets/img/profile.png",
    "https://example.com/SILHOUETTE.png",
    "https://example.com/Logo_of_the_Ultimate_Fighting_Championship.svg",
    "https://example.com/Flag_of_Brazil.svg"
  ];
  for (const photoUrl of placeholders) {
    assert.equal(isUsablePhoto(photoUrl), false);
    assert.equal(hasUsablePhoto(photoUrl), isUsablePhoto(photoUrl));
    assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl }), true);
  }
  for (const photoUrl of [null, "", "   ", completeFighter().photoUrl, "https://a.espncdn.com/i/headshots/mma/players/full/333.png"]) {
    assert.equal(hasUsablePhoto(photoUrl), isUsablePhoto(photoUrl));
  }
});

function mockEnrichment(context: TestContext, athlete: Record<string, unknown> = {}) {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ athlete: { id: "333", ...athlete } })));
  const image = context.mock.method(imageStore, "persistImageLocally", async () => "/media/fighters/new-photo.png");
  const update = context.mock.fn(async (_input: unknown) => ({}));
  const log = context.mock.method(console, "log", () => {});
  return { prisma: { fighter: { update } }, update, image, log };
}

test("enrichFighter заменяет силуэт настоящим фото и сообщает заполненное поле", async (context) => {
  const fixture = mockEnrichment(context, { headshot: { href: "https://a.espncdn.com/photo.png" } });
  const fighter = { ...completeFighter(), photoUrl: "/themes/custom/ufc/assets/img/silhouette.png" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result, { changedFields: ["photoUrl"], filledFields: ["photoUrl"], photoError: null });
  assert.deepEqual(fixture.update.mock.calls[0]?.arguments[0], {
    where: { id: fighter.id }, data: { photoUrl: "/media/fighters/new-photo.png", espnId: fighter.espnId }
  });
  assert.equal(fixture.image.mock.callCount(), 1);
});

test("enrichFighter сохраняет имеющееся настоящее фото", async (context) => {
  const fixture = mockEnrichment(context, { headshot: { href: "https://a.espncdn.com/another-photo.png" } });
  const fighter = completeFighter();
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result.filledFields, []);
  assert.deepEqual(result.changedFields, []);
  assert.equal(fixture.image.mock.callCount(), 0);
});

test("enrichFighter не считает отсутствие данных заполнением и сохраняет ротацию по updatedAt", async (context) => {
  const fixture = mockEnrichment(context);
  const fighter = { ...completeFighter(), team: "" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result, { changedFields: [], filledFields: [], photoError: null });
  assert.deepEqual(fixture.update.mock.calls[0]?.arguments[0], {
    where: { id: fighter.id }, data: { espnId: fighter.espnId }
  });
});

test("enrichFighter отличает обновление рекорда от заполнения отсутствующего зала", async (context) => {
  const fixture = mockEnrichment(context, { statsSummary: { statistics: [{ type: "wins-losses-draws", displayValue: "30-1-0" }] } });
  const fighter = { ...completeFighter(), team: "" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result.changedFields, ["record"]);
  assert.deepEqual(result.filledFields, []);
});

test("enrichFighter сообщает ошибку фото и сохраняет полученные текстовые данные", async (context) => {
  const fixture = mockEnrichment(context, { association: { name: " New Team " }, headshot: { href: "https://a.espncdn.com/photo.png" } });
  fixture.image.mock.mockImplementation(async () => { throw new Error("Image download HTTP 403"); });
  const fighter = { ...completeFighter(), photoUrl: null, team: "" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result, { changedFields: ["team"], filledFields: ["team"], photoError: "Image download HTTP 403" });
  assert.deepEqual(fixture.update.mock.calls[0]?.arguments[0], {
    where: { id: fighter.id }, data: { team: "New Team", espnId: fighter.espnId }
  });
});

test("enrichFighter считает несохранённое фото ошибкой", async (context) => {
  const fixture = mockEnrichment(context, { headshot: { href: "https://a.espncdn.com/photo.png" } });
  fixture.image.mock.mockImplementation(async () => null);
  const fighter = { ...completeFighter(), photoUrl: null };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.equal(result.photoError, "Photo was not saved");
  assert.deepEqual(result.filledFields, []);
});

test("enrichFighter не загружает заглушку, полученную от ESPN", async (context) => {
  const fixture = mockEnrichment(context, { headshot: { href: "https://example.com/silhouette.png" } });
  const fighter = { ...completeFighter(), photoUrl: null };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.equal(result.photoError, null);
  assert.deepEqual(result.filledFields, []);
  assert.equal(fixture.image.mock.callCount(), 0);
});

test("enrichFighter в dry-run показывает план фото и не пишет в базу или на диск", async (context) => {
  const sourceUrl = "https://a.espncdn.com/photo.png";
  const fixture = mockEnrichment(context, { headshot: { href: sourceUrl } });
  const fighter = { ...completeFighter(), photoUrl: null };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, true);
  assert.deepEqual(result.filledFields, ["photoUrl"]);
  assert.equal(fixture.image.mock.callCount(), 0);
  assert.equal(fixture.update.mock.callCount(), 0);
  assert.ok(String(fixture.log.mock.calls[0]?.arguments[0]).includes(sourceUrl));
});

test("enrichFighter не перезаписывает заполненную страну гражданством из ESPN", async (context) => {
  const fixture = mockEnrichment(context, { citizenship: "Brazil" });
  const fighter = { ...completeFighter(), country: "США" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result.changedFields, []);
  assert.deepEqual(fixture.update.mock.calls[0]?.arguments[0], {
    where: { id: fighter.id }, data: { espnId: fighter.espnId }
  });
});

test("enrichFighter заполняет пустую страну", async (context) => {
  const fixture = mockEnrichment(context, { citizenship: "Moldova" });
  const fighter = { ...completeFighter(), country: "" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result.changedFields, ["country"]);
  const call = fixture.update.mock.calls[0]?.arguments[0] as { data: { country?: string } } | undefined;
  assert.equal(call?.data.country, "Молдова");
});

test("enrichFighter игнорирует стойку «--» и рекорд «0-0-0» из ESPN", async (context) => {
  const fixture = mockEnrichment(context, {
    displayFightingStyle: "--",
    statsSummary: { statistics: [{ type: "wins-losses-draws", displayValue: "0-0-0" }] }
  });
  const fighter = { ...completeFighter(), style: "Orthodox" };
  const result = await enrichFighter(fixture.prisma, fighter, fighter.espnId, false);
  assert.deepEqual(result.changedFields, []);
});

test("isProfileIncomplete отбирает карточки без привязки к ESPN, без рекорда и с пробелами", () => {
  assert.equal(isProfileIncomplete(completeFighter()), false);
  assert.equal(isProfileIncomplete({ ...completeFighter(), espnId: null }), true);
  assert.equal(isProfileIncomplete({ ...completeFighter(), record: "" }), true);
  assert.equal(isProfileIncomplete({ ...completeFighter(), heightCm: 0 }), true);
});

test("enrichFighter не скрывает ошибку API", async (context) => {
  const fixture = mockEnrichment(context);
  context.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(enrichFighter(fixture.prisma, completeFighter(), "333", false), /HTTP 503/);
  assert.equal(fixture.update.mock.callCount(), 0);
});

type EnrichmentResult = { changedFields: string[]; filledFields: string[]; photoError: string | null };

// Запускаем реальные CLI-циклы с подменёнными внешними границами: без БД, сети и ожиданий.
type CliOptions = { argv?: string[]; complete?: number[] };

async function runCli(script: string, outcomes: Array<EnrichmentResult | Error>, options: CliOptions = {}) {
  // По умолчанию у всех бойцов пустой зал — карточка неполная; `complete` делает указанных полными.
  const fighters = outcomes.map((_, index) => ({
    ...completeFighter(),
    id: String(index),
    espnId: String(index + 1),
    team: options.complete?.includes(index) ? "Eagles MMA" : "",
    updatedAt: new Date(0)
  }));
  const output: string[] = [];
  const processStub = { argv: ["node", script, ...(options.argv ?? [])], exitCode: 0 };
  let disconnected = false;
  const imports: Record<string, unknown> = {
    "@prisma/client": { PrismaClient: class {
      fighter = { findMany: async () => fighters };
      async $disconnect() { disconnected = true; }
    } },
    "./fighter-import-utils": { parseArgs },
    "./fighter-name-matching": { findExactFighterMatch: () => null },
    "./espn-roster-utils": { collectScoreboardCompetitors: () => fighters.map(f => ({ espnId: f.espnId, fullName: f.name })) },
    "./espn-enrich": {
      ESPN_FIGHTER_SELECT, needsEspnBackfill, isProfileIncomplete, REQUEST_DELAY_MS: 0, sleep: async () => {}, fetchJson: async () => ({}),
      enrichFighter: async (_prisma: unknown, fighter: { id: string }) => {
        const result = outcomes[Number(fighter.id)];
        if (result instanceof Error) throw result;
        return result;
      }
    }
  };
  await runInNewContext(readFileSync(script, "utf8"), {
    require: (name: string) => { if (!(name in imports)) throw new Error(`Unexpected import: ${name}`); return imports[name]; },
    process: processStub,
    console: { log: (line: string) => output.push(line), warn: (line: string) => output.push(line), error: (line: string) => output.push(line) }
  });
  assert.equal(disconnected, true);
  return { output: output.join("\n"), exitCode: processStub.exitCode };
}

test("backfill считает заполнение, отсутствие данных, ошибки фото и API отдельно", async () => {
  const result = await runCli("scripts/backfill-espn-fighter-data.js", [
    { changedFields: ["team"], filledFields: ["team"], photoError: null },
    { changedFields: ["record"], filledFields: [], photoError: null },
    { changedFields: ["team"], filledFields: ["team"], photoError: "Image HTTP 403" },
    new Error("ESPN HTTP 503")
  ]);
  assert.match(result.output, /обогащено=1 без_заполнения=1 ошибок_фото=1 ошибок=1/);
  assert.match(result.output, /Image HTTP 403; заполнены поля: team/);
  assert.equal(result.exitCode, 0);
});

test("sync-roster отличает обновления от холостых прогонов и ошибок фото", async () => {
  const result = await runCli("scripts/sync-espn-roster.js", [
    { changedFields: ["record"], filledFields: [], photoError: null },
    { changedFields: [], filledFields: [], photoError: null },
    { changedFields: [], filledFields: [], photoError: "Image HTTP 403" }
  ]);
  assert.match(result.output, /updated=1 unchanged=1 photoFailed=1 failed=0/);
  assert.equal(result.exitCode, 0);
});

test("sync-roster --only-missing пропускает полные карточки и сужает окно скорборда", async () => {
  const result = await runCli(
    "scripts/sync-espn-roster.js",
    [
      { changedFields: ["record"], filledFields: [], photoError: null },
      { changedFields: ["record"], filledFields: [], photoError: null }
    ],
    { argv: ["--only-missing", "--days-back", "1", "--days-forward", "10"], complete: [0] }
  );
  assert.match(result.output, /−1\/\+10 days, only incomplete profiles/);
  assert.match(result.output, /Matched: 2, unmatched \(not in roster\): 0, enriching: 1/);
  assert.match(result.output, /updated=1 unchanged=0/);
});

for (const script of ["scripts/backfill-espn-fighter-data.js", "scripts/sync-espn-roster.js"]) {
  test(`${script}: отсутствие новых данных не роняет прогон, полный отказ фото роняет`, async () => {
    const empty = await runCli(script, [{ changedFields: [], filledFields: [], photoError: null }]);
    assert.equal(empty.exitCode, 0);
    const failed = await runCli(script, [{ changedFields: [], filledFields: [], photoError: "Image HTTP 403" }]);
    assert.equal(failed.exitCode, 1);
  });
}

test("needsEspnBackfill отбирает бойца без фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: null }), true);
});

test("needsEspnBackfill считает пустую строку в фото отсутствием фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: "   " }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым ростом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), heightCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым размахом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), reachCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с пустым залом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), team: "" }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым возрастом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), age: 0 }), true);
});

// ESPN не отдаёт ударную статистику UFC. Если считать её отсутствие поводом для
// прогона, скрипт будет вечно гонять одних и тех же бойцов вхолостую.
test("needsEspnBackfill игнорирует отсутствие ударной статистики UFC", () => {
  const fighter = { ...completeFighter(), sigStrikesLandedPerMin: null, strikeAccuracy: null };
  assert.equal(needsEspnBackfill(fighter), false);
});
