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
