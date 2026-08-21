import assert from "node:assert/strict";
import test from "node:test";

import { COMPARE_METRICS, formatMetricValue, pickBetterSide } from "../lib/compare-metrics";

test("для обычной метрики лучше большее значение", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3.5, 2.1), "a");
  assert.equal(pickBetterSide({ direction: "higher" }, 2.1, 3.5), "b");
});

test("SApM инвертирована: меньше пропущенных ударов лучше", () => {
  const sapm = COMPARE_METRICS.find((metric) => metric.key === "sigStrikesAbsorbedPerMin");
  assert.ok(sapm, "метрика SApM должна быть в списке");
  assert.equal(sapm.direction, "lower");
  assert.equal(pickBetterSide(sapm, 2.16, 4.02), "a");
  assert.equal(pickBetterSide(sapm, 4.02, 2.16), "b");
});

test("равные значения не дают подсветки", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3, 3), null);
  assert.equal(pickBetterSide({ direction: "lower" }, 3, 3), null);
});

test("пропущенное значение у одной стороны снимает подсветку", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3.5, null), null);
  assert.equal(pickBetterSide({ direction: "higher" }, null, 3.5), null);
  assert.equal(pickBetterSide({ direction: "higher" }, null, null), null);
});

test("нейтральные метрики не подсвечиваются никогда", () => {
  assert.equal(pickBetterSide({ direction: "neutral" }, 44, 33), null);
  assert.equal(COMPARE_METRICS.find((metric) => metric.key === "age")?.direction, "neutral");
  assert.equal(COMPARE_METRICS.find((metric) => metric.key === "heightCm")?.direction, "neutral");
});

test("размах рук сравнивается — большее значение преимущество", () => {
  assert.equal(COMPARE_METRICS.find((metric) => metric.key === "reachCm")?.direction, "higher");
});

test("formatMetricValue: ноль — валидное значение, не «—»", () => {
  const metric = COMPARE_METRICS.find((m) => m.key === "winsByKnockout")!;
  assert.equal(formatMetricValue(metric, 0), "0");
  assert.equal(formatMetricValue(metric, null), "—");
  assert.equal(formatMetricValue(metric, undefined), "—");
});
