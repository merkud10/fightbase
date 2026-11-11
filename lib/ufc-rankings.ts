
type UfcOfficialRankingRow = {
  rank: number;
  name: string;
  officialSlug: string;
  badge: string | null;
};

export type UfcOfficialRankingGroup = {
  title: string;
  champion: {
    name: string;
    officialSlug: string;
    imageUrl: string | null;
  };
  rows: UfcOfficialRankingRow[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

// Strip tags before trimming the suffix: in the real markup "Top Rank" sits inside
// <span>…</span>, so an end-anchored regex never matches the raw HTML string.
function normalizeDivisionTitle(value: string) {
  return stripHtml(value).replace(/\s+Top Rank$/i, "").trim();
}

// Matches both the official English titles and the legacy Russian ones still stored in
// old snapshots. Pound-for-pound groups have no division champion: UFC.com puts the #1
// fighter in the "champion" slot and repeats them as the first ranked row.
export function isPoundForPoundRankingGroup(title: string) {
  return /pound-for-pound/i.test(title) || /вне\s+(зависимости\s+от\s+категорий|весовых\s+категорий)/i.test(title);
}

// С октября 2026 ufc.ru отдаёт часть ссылок на бойцов как /index%2ephp/athlete/<slug>
// (270 из 382 на 25.10), остальные — как /athlete/<slug>. Без префикса парсер
// терял чемпионов вместе с дивизионами и бойцов в строках.
const ATHLETE_HREF_PREFIX = String.raw`(?:\/index(?:%2e|\.)php)?\/athlete\/`;

function parseRankingRows(sectionHtml: string): UfcOfficialRankingRow[] {
  const rows = [...sectionHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
    .map((match) => {
      const rowHtml = match[1] ?? "";
      const rankMatch = rowHtml.match(/views-field-weight-class-rank">\s*([^<]+)\s*<\/td>/i);
      const fighterMatch = rowHtml.match(new RegExp(String.raw`<a[^>]*href="${ATHLETE_HREF_PREFIX}([^"]+)"[^>]*>([^<]+)<\/a>`, "i"));
      const badgeMatch = rowHtml.match(/views-field-weight-class-rank-change">\s*([\s\S]*?)\s*<\/td>/i);

      if (!rankMatch || !fighterMatch) {
        return null;
      }

      const badgeText = stripHtml(badgeMatch?.[1] || "");

      return {
        rank: Number((rankMatch[1] ?? "").trim()),
        officialSlug: (fighterMatch[1] ?? "").trim(),
        name: decodeHtml((fighterMatch[2] ?? "").trim()),
        badge: badgeText || null
      };
    })
    .filter((row): row is UfcOfficialRankingRow => row !== null)
    .filter((row) => Number.isFinite(row.rank));

  return rows;
}

// ufc.com/rankings is a slow, Cloudflare-fronted external dependency (observed 6-19s, and it
// serves datacenter IPs 403/429/503 bot challenges). This fetcher is called only by the protected
// snapshot refresh flow, never while rendering the public rankings page. Cap the wait and never
// throw so a transient upstream failure preserves the last successful database snapshot.
const UFC_RANKINGS_FETCH_TIMEOUT_MS = 15_000;

export type RankChange = { direction: "up" | "down"; delta: number } | { direction: "new" };

// UFC.com пишет изменение позиции в соседней ячейке: «Rank increased by 1»,
// «Rank decreased by 2», «NR» (на ufc.ru — «НОВ») для новичка рейтинга.
// Остальные пометки изменением позиции не считаем.
export function parseRankChange(badge: string | null | undefined): RankChange | null {
  const text = (badge ?? "").trim();
  if (!text) return null;

  const moved = text.match(/rank\s+(increased|decreased)\s+by\s+(\d+)/i);
  if (moved) {
    const delta = Number(moved[2]);
    if (!Number.isFinite(delta) || delta <= 0) return null;
    return { direction: moved[1]?.toLowerCase() === "increased" ? "up" : "down", delta };
  }

  return /^(nr|нов)$/i.test(text) ? { direction: "new" } : null;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const LAST_UPDATED_PATTERN = String.raw`Last\s+updated:\s*(?:[A-Za-z]+,\s*)?([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?`;

// «Last updated: Tuesday, Nov. 10» — дата, когда UFC в последний раз пересчитал
// рейтинг. На странице таких строк две: первая относится к официальному рейтингу
// (data-rankings-footer="media"), вторая — к алгоритмическому Meta UFC Rankings.
// Года в строке нет: берём год опроса, а если дата оказалась в будущем — прошлый.
// В настоящей разметке между «Last» и «updated» стоит перевод строки с отступом.
export function parseUfcRankingsUpdatedAt(html: string, now = new Date()): Date | null {
  const match =
    html.match(new RegExp(String.raw`data-rankings-footer="media"[^>]*>\s*` + LAST_UPDATED_PATTERN, "i")) ??
    html.match(new RegExp(LAST_UPDATED_PATTERN, "i"));
  if (!match) return null;

  const month = MONTH_INDEX[(match[1] ?? "").toLowerCase()];
  const day = Number(match[2]);
  if (month === undefined || !Number.isInteger(day) || day < 1 || day > 31) return null;

  const build = (year: number) => new Date(Date.UTC(year, month, day, 12));
  let date = build(match[3] ? Number(match[3]) : now.getUTCFullYear());
  if (!match[3] && date.getTime() - now.getTime() > 2 * 86_400_000) {
    date = build(now.getUTCFullYear() - 1);
  }

  return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

export type UfcOfficialRankingsPage = {
  groups: UfcOfficialRankingGroup[];
  // Когда UFC обновил рейтинг; null — строку с датой на странице не нашли.
  sourceUpdatedAt: Date | null;
};

export async function fetchUfcOfficialRankings(): Promise<UfcOfficialRankingGroup[]> {
  return (await fetchUfcOfficialRankingsPage()).groups;
}

export async function fetchUfcOfficialRankingsPage(): Promise<UfcOfficialRankingsPage> {
  const empty: UfcOfficialRankingsPage = { groups: [], sourceUpdatedAt: null };
  let html: string;

  try {
    const response = await fetch("https://www.ufc.com/rankings", {
      headers: {
        "user-agent": "Mozilla/5.0 FightBase/1.0"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(UFC_RANKINGS_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.error(`[ufc-rankings] upstream responded ${response.status}; serving empty rankings`);
      return empty;
    }

    html = await response.text();
  } catch (error) {
    console.error("[ufc-rankings] failed to fetch UFC rankings; serving empty rankings", error);
    return empty;
  }

  const groupingMatches = [
    ...html.matchAll(
      /<div class="view-grouping-header">([\s\S]*?)<\/div>\s*<div class="view-grouping-content"><table class="cols-0">([\s\S]*?)<\/table>/gi
    )
  ];

  const parsedGroups = groupingMatches
    .map((match) => {
      const title = normalizeDivisionTitle(match[1] ?? "");
      const sectionHtml = match[2] ?? "";

      const championMatch = sectionHtml.match(
        new RegExp(String.raw`<h5><a href="${ATHLETE_HREF_PREFIX}([^"]+)"[^>]*>([^<]+)<\/a><\/h5>[\s\S]*?<img src="([^"]+)"`, "i")
      );

      if (!championMatch) {
        return null;
      }

      const rows = parseRankingRows(sectionHtml);

      return {
        title,
        champion: {
            officialSlug: (championMatch[1] ?? "").trim(),
            name: decodeHtml((championMatch[2] ?? "").trim()),
          imageUrl: championMatch[3]?.trim() || null
        },
        rows
      };
    })
    .filter((group): group is UfcOfficialRankingGroup => group !== null);

  return { groups: parsedGroups, sourceUpdatedAt: parseUfcRankingsUpdatedAt(html) };
}
