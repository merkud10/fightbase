// Начало публичной серии статистики прогнозов. Пики старше этой даты остаются в базе,
// но в точность и ROI на сайте не входят: серия ведётся от смены ИИ-модели FightBase.
// Задаётся PREDICTION_STATS_SINCE=YYYY-MM-DD; без переменной считается вся история.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getPredictionStatsSince(env: Record<string, string | undefined> = process.env): Date | null {
  const raw = (env.PREDICTION_STATS_SINCE ?? "").trim();
  const match = raw.match(ISO_DATE);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const roundTrips =
    date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
  return roundTrips ? date : null;
}

/** Фильтр по дате турнира для Prisma: undefined, когда серия не ограничена. */
export function predictionStatsDateFilter(env: Record<string, string | undefined> = process.env): { gte: Date } | undefined {
  const since = getPredictionStatsSince(env);
  return since ? { gte: since } : undefined;
}

const RU_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

export function predictionStatsSinceNote(since: Date | null, locale: "ru" | "en"): string | null {
  if (!since) {
    return null;
  }
  if (locale === "ru") {
    return `Статистика ведётся с ${since.getUTCDate()} ${RU_MONTHS[since.getUTCMonth()]} ${since.getUTCFullYear()} года: с этого дня прогнозы делает обновлённая ИИ-модель FightBase, предыдущая серия в расчёт не входит.`;
  }
  const formatted = since.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `Tracked since ${formatted}: from that day the picks come from the updated FightBase AI model, and the earlier series is not counted.`;
}
