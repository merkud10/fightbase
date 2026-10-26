// Хаб /results: последний турнир целиком, несколько предыдущих карточками и
// архив по месяцам. По Вордстату (октябрь 2026) ищут «юфс результаты» (~19 тыс.
// в месяц) и «результаты юфс сегодня» (~5 тыс.) — это про номерные турниры и
// Fight Night, поэтому Contender Series в первые блоки не ставим, только в архив.

type ResultsHubEvent = {
  slug: string;
  name: string;
  date: Date;
  fights: ReadonlyArray<{ status: string }>;
};

export type ResultsArchiveMonth<T> = { key: string; events: T[] };

export function isContenderSeries(name: string) {
  return /contender series/i.test(name);
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildResultsHub<T extends ResultsHubEvent>(events: readonly T[], options: { recentCount: number }) {
  // Турнир без единого завершённого боя — результаты ещё не пришли (ночь турнира до первого итога).
  const decided = [...events]
    .filter((event) => event.fights.some((fight) => fight.status === "completed"))
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const headline = decided.filter((event) => !isContenderSeries(event.name));

  const archive: ResultsArchiveMonth<T>[] = [];
  for (const event of decided) {
    const key = monthKey(event.date);
    const last = archive.at(-1);
    if (last?.key === key) last.events.push(event);
    else archive.push({ key, events: [event] });
  }

  return {
    latest: headline[0] ?? null,
    recent: headline.slice(1, 1 + options.recentCount),
    archive
  };
}
