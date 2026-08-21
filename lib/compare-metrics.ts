import type { Fighter } from "@prisma/client";

import type { Locale } from "@/lib/locale-config";

export type CompareDirection = "higher" | "lower" | "neutral";

type NumericFighterKey = {
  [K in keyof Fighter]-?: NonNullable<Fighter[K]> extends number ? K : never;
}[keyof Fighter];

export type CompareMetric = {
  key: NumericFighterKey;
  labelRu: string;
  labelEn: string;
  direction: CompareDirection;
  suffix?: string;
  decimals?: number;
};

// direction: "higher" — больше лучше, "lower" — меньше лучше,
// "neutral" — показываем различие, но преимущества не присуждаем.
export const COMPARE_METRICS: CompareMetric[] = [
  { key: "age", labelRu: "Возраст", labelEn: "Age", direction: "neutral" },
  { key: "heightCm", labelRu: "Рост", labelEn: "Height", direction: "neutral", suffix: " см" },
  { key: "reachCm", labelRu: "Размах рук", labelEn: "Reach", direction: "higher", suffix: " см" },
  { key: "winsByKnockout", labelRu: "Побед KO/TKO", labelEn: "Wins by KO/TKO", direction: "higher" },
  { key: "winsBySubmission", labelRu: "Побед сабмишеном", labelEn: "Wins by submission", direction: "higher" },
  { key: "winsByDecision", labelRu: "Побед решением", labelEn: "Wins by decision", direction: "higher" },
  { key: "sigStrikesLandedPerMin", labelRu: "SLpM", labelEn: "SLpM", direction: "higher", decimals: 2 },
  { key: "strikeAccuracy", labelRu: "Точность ударов", labelEn: "Strike accuracy", direction: "higher", suffix: "%" },
  { key: "sigStrikesAbsorbedPerMin", labelRu: "SApM", labelEn: "SApM", direction: "lower", decimals: 2 },
  { key: "strikeDefense", labelRu: "Защита в стойке", labelEn: "Strike defense", direction: "higher", suffix: "%" },
  { key: "takedownAveragePer15", labelRu: "Тейкдауны / 15 мин", labelEn: "Takedowns / 15 min", direction: "higher", decimals: 2 },
  { key: "takedownAccuracy", labelRu: "Точность тейкдаунов", labelEn: "Takedown accuracy", direction: "higher", suffix: "%" },
  { key: "takedownDefense", labelRu: "Защита от тейкдаунов", labelEn: "Takedown defense", direction: "higher", suffix: "%" },
  { key: "submissionAveragePer15", labelRu: "Сабмишены / 15 мин", labelEn: "Submissions / 15 min", direction: "higher", decimals: 2 }
];

export function getMetricLabel(metric: CompareMetric, locale: Locale) {
  return locale === "ru" ? metric.labelRu : metric.labelEn;
}

export function pickBetterSide(
  metric: Pick<CompareMetric, "direction">,
  valueA: number | null | undefined,
  valueB: number | null | undefined
): "a" | "b" | null {
  if (metric.direction === "neutral") {
    return null;
  }

  if (typeof valueA !== "number" || typeof valueB !== "number") {
    return null;
  }

  // NaN не равен ничему, поэтому без этой проверки сравнение ниже всегда даёт
  // false и молча присуждает победу стороне B. Infinity отсекаем заодно.
  if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
    return null;
  }

  if (valueA === valueB) {
    return null;
  }

  const aWins = metric.direction === "higher" ? valueA > valueB : valueA < valueB;

  return aWins ? "a" : "b";
}

export function formatMetricValue(metric: CompareMetric, value: number | null | undefined) {
  // 0 — валидное значение (например, 0 сабмишенов), не должно превращаться в «—»
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const formatted = metric.decimals !== undefined ? value.toFixed(metric.decimals) : String(value);

  return `${formatted}${metric.suffix ?? ""}`;
}
