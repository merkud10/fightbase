import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const scriptUrl = new URL("../scripts/generate-prediction-snapshots.js", import.meta.url);
const scriptRequire = createRequire(scriptUrl);
const source = readFileSync(scriptUrl, "utf8");

function harness({ regenerate = true, generated = true, startedDuringRun = false } = {}) {
  const fight = {
    id: "fight", slug: "a-vs-b", status: "scheduled", eventId: "event", fighterAId: "a", fighterBId: "b",
    weightClass: "Lightweight", oddsA: 3, oddsB: 1.5,
    event: { id: "event", slug: "event", name: "UFC", status: "upcoming", date: new Date("2099-01-01"), promotion: { name: "UFC" } },
    fighterA: { id: "a", name: "Боец А", record: "10-2-0", recentFights: [] },
    fighterB: { id: "b", name: "Боец Б", record: "12-1-0", recentFights: [] }
  };
  const existing = { fightId: "fight", aiContentHash: "same-hash", aiGeneratedAt: new Date("2026-01-01"), aiPickFighterId: "a", aiPickReasonRu: "Старый прогноз", aiPickGeneratedAt: new Date("2026-01-01"), oddsAAtPick: 2, oddsBAtPick: 2 };
  const writes: any[] = [];
  let generations = 0;
  const db = {
    fight: { findMany: async () => [fight], findUnique: async () => startedDuringRun ? { ...fight, status: "live" } : fight },
    fightPredictionSnapshot: { findMany: async () => [existing], upsert: async (args: any) => writes.push(args) },
    systemEvent: { create: async () => ({}) }, $disconnect: async () => {}
  };
  const mockProcess = { argv: ["node", "script", ...(regenerate ? ["--regenerate"] : [])], exitCode: 0, env: { PREDICTION_AI_COPY: "1", AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "test", DEEPSEEK_BASE_URL: "https://example.test", DEEPSEEK_MODEL: "test", PREDICTION_AI_TIMEOUT_MS: "100" } };
  const module = { exports: {} as any };
  const mockRequire = (name: string) => {
    if (name === "@prisma/client") return { PrismaClient: function () { return db; } };
    if (name === "./prediction-ai-copy") return {
      ...scriptRequire(name), computeAiContentHash: () => "same-hash",
      generateAiPredictionCopy: async () => { generations++; return generated ? { pick: "B", pickReason: "Новый прогноз", copy: { overview: "Новый обзор", keyEdge: "Новое преимущество", fightScript: "Сценарий", pathA: "Путь А", pathB: "Путь Б" } } : null; }
    };
    return scriptRequire(name);
  };
  vm.runInNewContext(source, { require: mockRequire, module, process: mockProcess, console: { log() {}, warn() {} }, Date });
  return { ...module.exports, fight, writes, mockProcess, generations: () => generations };
}

test("explicit regeneration bypasses cached copy and refreshes the pick and its odds", async () => {
  const h = harness(); await h.main();
  assert.equal(h.generations(), 1);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].update.aiPickFighterId, "b");
  assert.equal(h.writes[0].update.aiPickReasonRu, "Новый прогноз");
  assert.equal(h.writes[0].update.oddsAAtPick, 3);
});

test("ordinary runs preserve the original pick and reuse cached copy", async () => {
  const h = harness({ regenerate: false }); await h.main();
  assert.equal(h.generations(), 0);
  assert.equal(h.writes[0].update.aiPickFighterId, "a");
  assert.equal(h.writes[0].update.oddsAAtPick, 2);
});

test("failed regeneration preserves the published snapshot and reports failure", async () => {
  const h = harness({ generated: false }); await h.main();
  assert.equal(h.writes.length, 0);
  assert.equal(h.mockProcess.exitCode, 1);
});

test("a bout starting during generation is not overwritten", async () => {
  const h = harness({ startedDuringRun: true }); await h.main();
  assert.equal(h.writes.length, 0);
});

test("regeneration eligibility follows actual prelim start and excludes archives", () => {
  const h = harness(); const now = new Date("2026-09-05T12:00:00Z");
  const f = { ...h.fight, event: { ...h.fight.event, date: new Date("2026-09-05"), prelimsAt: new Date("2026-09-05T16:00:00Z") } };
  assert.equal(h.canRegeneratePrediction(f, now), true);
  assert.equal(h.canRegeneratePrediction(f, new Date("2026-09-05T16:00:00Z")), false);
  assert.equal(h.canRegeneratePrediction({ ...f, status: "finished" }, now), false);
  assert.equal(h.canRegeneratePrediction({ ...f, event: { ...f.event, status: "live" } }, now), false);
  const options = h.parseArgs(["--regenerate", "--event-slug", "event", "--fight-slug", "a-vs-b"]);
  assert.equal(options.regenerate, true);
  assert.equal(options.eventSlug, "event");
  assert.equal(options.fightSlug, "a-vs-b");
});
