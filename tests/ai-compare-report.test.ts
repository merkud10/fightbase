import test from "node:test";
import assert from "node:assert/strict";

import { buildCompareReport, type CompareRow } from "../scripts/ai-compare-report";

const rows: CompareRow[] = [
  {
    index: 1,
    sourceLabel: "MMA Fighting",
    sourceUrl: "https://example.com/1",
    headline: "Fighter wins",
    outcomes: [
      { provider: "codex", ok: true, model: "codex:gpt-5.3-codex-spark", headline: "Боец победил", body: "Текст один.", interestScore: 7, durationMs: 12000, error: null },
      { provider: "deepseek", ok: true, model: "deepseek-chat", headline: "Победа бойца", body: "Текст два, длиннее.", interestScore: 6, durationMs: 8000, error: null }
    ]
  },
  {
    index: 2,
    sourceLabel: "MMA Junkie",
    sourceUrl: "https://example.com/2",
    headline: "Card changes",
    outcomes: [
      { provider: "codex", ok: false, model: null, headline: "", body: "", interestScore: null, durationMs: 3000, error: "HTTP 502: rate limit" },
      { provider: "deepseek", ok: true, model: "deepseek-chat", headline: "Изменения в карде", body: "Текст.", interestScore: 5, durationMs: 4000, error: null }
    ]
  }
];

test("buildCompareReport renders every input with both providers and a summary", () => {
  const report = buildCompareReport(rows, { generatedAt: "2026-09-05T12:00:00.000Z" });
  assert.match(report, /^# Сравнение AI-провайдеров/m);
  assert.match(report, /## 1\. Fighter wins/);
  assert.match(report, /## 2\. Card changes/);
  assert.match(report, /### codex — codex:gpt-5\.3-codex-spark, 12\.0 с, interest 7/);
  assert.match(report, /### deepseek — deepseek-chat, 8\.0 с, interest 6/);
  assert.match(report, /### codex — ошибка, 3\.0 с/);
  assert.match(report, /HTTP 502: rate limit/);
  assert.match(report, /\| codex \| 2 \| 1 \| 7\.5 \| 11 \|/);
  assert.match(report, /\| deepseek \| 2 \| 0 \| 6\.0 \| 13 \|/);
});
