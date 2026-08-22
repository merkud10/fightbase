import {
  COMPARE_METRICS,
  formatMetricValue,
  getMetricLabel,
  pickBetterSide
} from "@/lib/compare-metrics";
import type { ComparisonFighter } from "@/lib/db/comparison";
import { getDisplayName } from "@/lib/display";
import type { Locale } from "@/lib/locale-config";

type CompareTableProps = {
  fighterA: ComparisonFighter;
  fighterB: ComparisonFighter;
  locale: Locale;
};

type CompareRow = {
  key: string;
  label: string;
  valueA: string;
  valueB: string;
  better: "a" | "b" | null;
};

// Строковые характеристики (рекорд, среднее время боя) не проходят через
// COMPARE_METRICS: сравнивать их нечем, поэтому только показываем как есть.
function buildTextRow(key: string, label: string, rawA: string | null, rawB: string | null): CompareRow | null {
  const valueA = (rawA ?? "").trim();
  const valueB = (rawB ?? "").trim();

  if (!valueA && !valueB) {
    return null;
  }

  return {
    key,
    label,
    valueA: valueA || "—",
    valueB: valueB || "—",
    better: null
  };
}

export function CompareTable({ fighterA, fighterB, locale }: CompareTableProps) {
  const isRu = locale === "ru";

  const recordRow = buildTextRow(
    "record",
    isRu ? "Рекорд" : "Record",
    fighterA.record,
    fighterB.record
  );

  const metricRows = COMPARE_METRICS.map((metric): CompareRow | null => {
    // metric.key сужен до числовых полей Fighter, и все они есть в выборке
    // ComparisonFighter, поэтому индексация типизируется как number | null.
    const valueA = fighterA[metric.key];
    const valueB = fighterB[metric.key];

    if (typeof valueA !== "number" && typeof valueB !== "number") {
      return null;
    }

    return {
      key: metric.key,
      label: getMetricLabel(metric, locale),
      valueA: formatMetricValue(metric, valueA),
      valueB: formatMetricValue(metric, valueB),
      better: pickBetterSide(metric, valueA, valueB)
    };
  }).filter((row): row is CompareRow => row !== null);

  const fightTimeRow = buildTextRow(
    "averageFightTime",
    isRu ? "Среднее время боя" : "Average fight time",
    fighterA.averageFightTime,
    fighterB.averageFightTime
  );

  const rows = [recordRow, ...metricRows, fightTimeRow].filter((row): row is CompareRow => row !== null);

  if (rows.length === 0) {
    return null;
  }

  const nameA = getDisplayName(fighterA, locale);
  const nameB = getDisplayName(fighterB, locale);
  const betterLabel = isRu ? "(лучший показатель)" : "(better value)";

  return (
    <section className="compare-table" aria-label={isRu ? "Сравнение характеристик" : "Attribute comparison"}>
      <div className="compare-table-head">
        <span className="compare-table-name">{nameA}</span>
        <span className="compare-table-head-label">{isRu ? "Показатель" : "Metric"}</span>
        <span className="compare-table-name">{nameB}</span>
      </div>
      <div className="compare-table-rows">
        {rows.map((row) => (
          <div className="compare-row" key={row.key}>
            <span className={row.better === "a" ? "compare-value is-better" : "compare-value"}>
              {row.valueA}
              {/* Преимущество передаётся цветом и насыщенностью — скринридеру нужен текст. */}
              {row.better === "a" ? <span className="sr-only"> {betterLabel}</span> : null}
            </span>
            <span className="compare-label">{row.label}</span>
            <span className={row.better === "b" ? "compare-value is-better" : "compare-value"}>
              {row.valueB}
              {row.better === "b" ? <span className="sr-only"> {betterLabel}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
