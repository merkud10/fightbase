import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

// UFC.com редиректит российские IP на ufc.ru, где слаг атлета транслитерирован
// («dzhastin-getzhi») и иногда вообще достался от другого бойца
// («dzheremaya-uells-0» — это Тацуро Таира). Английский слаг, совпадающий с
// нашим Fighter.slug, лежит в языковой альтернативе страницы.
const ATHLETE_HREF = /\/athlete\/([^"'/?#]+)/i;

export function extractEnglishAthleteSlug(html: string): string | null {
  // Атрибуты в реальной разметке идут в разном порядке, поэтому ищем тег
  // целиком и проверяем hreflang отдельно. Строго "en": региональные en-aus,
  // en-can и служебный en-zxx нам не нужны.
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bhreflang=["']en["']/i.test(tag)) continue;

    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const slug = href?.match(ATHLETE_HREF)?.[1];
    if (slug) return slug;
  }

  return null;
}

export function collectAthleteSlugs(groups: UfcOfficialRankingGroup[]): string[] {
  const slugs = new Set<string>();

  for (const group of groups) {
    if (group.champion.officialSlug) slugs.add(group.champion.officialSlug);
    for (const row of group.rows) {
      if (row.officialSlug) slugs.add(row.officialSlug);
    }
  }

  return [...slugs];
}

// Неразрешённые слаги остаются нетронутыми: страница тогда падает на матч по
// имени, а затем на «Ожидается» — то же поведение, что и до резолва.
export function applyAthleteSlugAliases(
  groups: UfcOfficialRankingGroup[],
  resolved: Map<string, string>
): UfcOfficialRankingGroup[] {
  if (resolved.size === 0) return groups;

  return groups.map((group) => ({
    ...group,
    champion: {
      ...group.champion,
      officialSlug: resolved.get(group.champion.officialSlug) ?? group.champion.officialSlug
    },
    rows: group.rows.map((row) => ({
      ...row,
      officialSlug: resolved.get(row.officialSlug) ?? row.officialSlug
    }))
  }));
}

export type AthleteSlugAlias = {
  officialSlug: string;
  englishSlug: string;
};

export type ResolveAthleteSlugAliasesOptions = {
  slugs: string[];
  known: Map<string, string>;
  fetchHtml: (slug: string) => Promise<string | null>;
  budgetMs?: number;
  concurrency?: number;
  now?: () => number;
};

export type ResolveAthleteSlugAliasesResult = {
  resolved: Map<string, string>;
  discovered: AthleteSlugAlias[];
};

export const ATHLETE_SLUG_RESOLVE_BUDGET_MS = 90_000;
export const ATHLETE_SLUG_RESOLVE_CONCURRENCY = 4;

// Первый прогон встречает ~150 незнакомых слагов, а ufc.ru отвечает за 2-6
// секунд. Бюджет по времени не даёт обновлению рейтинга растянуться: что не
// успели — доедет следующим запуском крона, потому что соответствия копятся в
// таблице. Ошибки намеренно проглатываются: непрорезолвленный слаг оставляет
// строку в том же состоянии, в каком она была до этой фичи.
export async function resolveAthleteSlugAliases({
  slugs,
  known,
  fetchHtml,
  budgetMs = ATHLETE_SLUG_RESOLVE_BUDGET_MS,
  concurrency = ATHLETE_SLUG_RESOLVE_CONCURRENCY,
  now = Date.now
}: ResolveAthleteSlugAliasesOptions): Promise<ResolveAthleteSlugAliasesResult> {
  const resolved = new Map<string, string>();
  const discovered: AthleteSlugAlias[] = [];
  const pending: string[] = [];

  for (const slug of slugs) {
    const cached = known.get(slug);
    if (cached) {
      resolved.set(slug, cached);
    } else {
      pending.push(slug);
    }
  }

  if (pending.length === 0) return { resolved, discovered };

  const deadline = now() + budgetMs;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length && now() < deadline) {
      const slug = pending[cursor++]!;

      try {
        const html = await fetchHtml(slug);
        const englishSlug = html ? extractEnglishAthleteSlug(html) : null;
        if (!englishSlug) continue;

        resolved.set(slug, englishSlug);
        discovered.push({ officialSlug: slug, englishSlug });
      } catch {
        // Один недоступный атлет не должен ронять остальных.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

  return { resolved, discovered };
}
