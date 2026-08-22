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

test("NaN и Infinity не присуждают победу ни одной стороне", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, NaN, NaN), null);
  assert.equal(pickBetterSide({ direction: "higher" }, NaN, 3), null);
  assert.equal(pickBetterSide({ direction: "higher" }, 3, NaN), null);
  assert.equal(pickBetterSide({ direction: "higher" }, Infinity, 3), null);
  assert.equal(pickBetterSide({ direction: "higher" }, 3, Infinity), null);
});

test("нейтральные метрики не подсвечиваются никогда", () => {
  assert.equal(pickBetterSide({ direction: "neutral" }, 44, 33), null);

  const age = COMPARE_METRICS.find((metric) => metric.key === "age");
  assert.ok(age, "возраст должен быть в списке");
  assert.equal(pickBetterSide(age, 30, 25), null);

  const height = COMPARE_METRICS.find((metric) => metric.key === "heightCm");
  assert.ok(height, "рост должен быть в списке");
  assert.equal(pickBetterSide(height, 185, 170), null);
});

test("размах рук сравнивается — большее значение преимущество", () => {
  const reach = COMPARE_METRICS.find((metric) => metric.key === "reachCm");
  assert.ok(reach, "метрика размаха рук должна быть в списке");
  assert.equal(pickBetterSide(reach, 198, 183), "a");
});

test("formatMetricValue: ноль — валидное значение, не «—»", () => {
  const metric = COMPARE_METRICS.find((m) => m.key === "winsByKnockout")!;
  assert.equal(formatMetricValue(metric, 0), "0");
  assert.equal(formatMetricValue(metric, null), "—");
  assert.equal(formatMetricValue(metric, undefined), "—");
});

test("formatMetricValue: NaN и Infinity возвращают «—»", () => {
  const metric = COMPARE_METRICS.find((m) => m.key === "winsByKnockout")!;
  assert.equal(formatMetricValue(metric, NaN), "—");
  assert.equal(formatMetricValue(metric, Infinity), "—");
});

test("formatMetricValue: суффиксы форматируются корректно", () => {
  const accuracy = COMPARE_METRICS.find((m) => m.key === "strikeAccuracy")!;
  assert.equal(formatMetricValue(accuracy, 53), "53%");

  const reach = COMPARE_METRICS.find((m) => m.key === "reachCm")!;
  assert.equal(formatMetricValue(reach, 198), "198 см");
});

test("formatMetricValue: decimals фиксирует знаки после запятой", () => {
  const slpm = COMPARE_METRICS.find((m) => m.key === "sigStrikesLandedPerMin")!;
  assert.equal(formatMetricValue(slpm, 4), "4.00");

  const ko = COMPARE_METRICS.find((m) => m.key === "winsByKnockout")!;
  assert.equal(formatMetricValue(ko, 4), "4");
});

test("ключи метрик в COMPARE_METRICS уникальны", () => {
  const keys = COMPARE_METRICS.map((m) => m.key);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, "обнаружен дублирующийся ключ в COMPARE_METRICS");
});
