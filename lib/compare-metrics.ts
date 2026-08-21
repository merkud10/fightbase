import type { Locale } from "@/lib/locale-config";

export type CompareDirection = "higher" | "lower" | "neutral";

export type CompareMetric = {
  key: string;
  labelRu: string;
  labelEn: string;
  direction: CompareDirection;
  suffix?: string;
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
  { key: "sigStrikesLandedPerMin", labelRu: "SLpM", labelEn: "SLpM", direction: "higher" },
  { key: "strikeAccuracy", labelRu: "Точность ударов", labelEn: "Strike accuracy", direction: "higher", suffix: "%" },
  { key: "sigStrikesAbsorbedPerMin", labelRu: "SApM", labelEn: "SApM", direction: "lower" },
  { key: "strikeDefense", labelRu: "Защита в стойке", labelEn: "Strike defense", direction: "higher", suffix: "%" },
  { key: "takedownAveragePer15", labelRu: "Тейкдауны / 15 мин", labelEn: "Takedowns / 15 min", direction: "higher" },
  { key: "takedownAccuracy", labelRu: "Точность тейкдаунов", labelEn: "Takedown accuracy", direction: "higher", suffix: "%" },
  { key: "takedownDefense", labelRu: "Защита от тейкдаунов", labelEn: "Takedown defense", direction: "higher", suffix: "%" },
  { key: "submissionAveragePer15", labelRu: "Сабмишены / 15 мин", labelEn: "Submissions / 15 min", direction: "higher" },
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

  // NaN технически проходит typeof === "number", но сравнения с ним всегда false,
  // поэтому оба ветвления ниже вернут null — случайно корректное поведение.
  // На практике NaN в базу не попадает (Prisma валидирует Float), но проверим явно.
  if (Number.isNaN(valueA) || Number.isNaN(valueB)) {
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
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `${value}${metric.suffix ?? ""}`;
}
