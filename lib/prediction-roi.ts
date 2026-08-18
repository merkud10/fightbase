import type { PredictionVerdict } from "@/lib/prediction-verdict";

// ROI прогнозов: каждый оценённый пик считается виртуальной ставкой в 1 у.е.
// по кэфу, зафиксированному в снапшоте на момент появления пика.
// Выигрыш = кэф − 1, проигрыш = −1; бои без чистого результата или без
// зафиксированного кэфа в расчёт не входят.

export function resolvePickRoiUnits(
  verdict: PredictionVerdict,
  odds: number | null | undefined
): number | null {
  if (odds == null || !Number.isFinite(odds) || odds <= 1) {
    return null;
  }
  if (verdict === "correct") {
    return odds - 1;
  }
  if (verdict === "wrong") {
    return -1;
  }
  return null;
}

export type RoiBucket = {
  staked: number;
  units: number;
};

export function emptyRoiBucket(): RoiBucket {
  return { staked: 0, units: 0 };
}

export function addToRoiBucket(bucket: RoiBucket, units: number | null) {
  if (units === null) {
    return;
  }
  bucket.staked += 1;
  bucket.units += units;
}

export function roiPercent(bucket: RoiBucket): number | null {
  return bucket.staked > 0 ? Math.round((bucket.units / bucket.staked) * 100) : null;
}

export function formatUnits(units: number, locale: "ru" | "en") {
  const rounded = Math.round(units * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  const value = `${sign}${rounded.toFixed(2)}`;
  return locale === "ru" ? `${value} у.е.` : `${value} u`;
}
