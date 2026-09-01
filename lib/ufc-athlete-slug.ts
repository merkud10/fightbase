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
