export const PAIR_SEPARATOR = "-vs-";

export function buildPairSlug(slugA: string, slugB: string) {
  const [first, second] = [slugA, slugB].sort((a, b) => a.localeCompare(b, "en"));

  return `${first}${PAIR_SEPARATOR}${second}`;
}

export function isCanonicalPairSlug(slugA: string, slugB: string) {
  return buildPairSlug(slugA, slugB) === `${slugA}${PAIR_SEPARATOR}${slugB}`;
}

// Слаг бойца теоретически может содержать "-vs-", поэтому разрез неоднозначен.
// Возвращаем все варианты; правильный выбирает вызывающий код, сверяясь с базой.
export function splitPairSlugCandidates(pairSlug: string) {
  const candidates: { a: string; b: string }[] = [];
  let index = pairSlug.indexOf(PAIR_SEPARATOR);

  while (index !== -1) {
    const a = pairSlug.slice(0, index);
    const b = pairSlug.slice(index + PAIR_SEPARATOR.length);

    if (a && b) {
      candidates.push({ a, b });
    }

    index = pairSlug.indexOf(PAIR_SEPARATOR, index + 1);
  }

  return candidates;
}
