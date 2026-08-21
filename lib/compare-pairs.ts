export const PAIR_SEPARATOR = "-vs-";

// Тип кандидата разбора — экспортируется, чтобы вызывающий код не дублировал его.
export type PairSlugCandidate = { a: string; b: string };

// Единственное место, где задан канонический порядок слагов в паре. Побайтовое
// сравнение, а не localeCompare: его результат зависит от полноты ICU-данных
// в конкретной сборке Node, а этот порядок запекается в канонические URL и sitemap —
// смена порядка означала бы массовую переиндексацию раздела. Слаги содержат только
// [a-z0-9-], locale-sensitive collation тут не нужна.
export function sortSlugPair(slugA: string, slugB: string): [string, string] {
  return slugA <= slugB ? [slugA, slugB] : [slugB, slugA];
}

export function buildPairSlug(slugA: string, slugB: string) {
  const [first, second] = sortSlugPair(slugA, slugB);

  return `${first}${PAIR_SEPARATOR}${second}`;
}

export function isCanonicalPairOrder(slugA: string, slugB: string) {
  return buildPairSlug(slugA, slugB) === `${slugA}${PAIR_SEPARATOR}${slugB}`;
}

// Слаг бойца теоретически может содержать "-vs-", поэтому разрез неоднозначен.
// Возвращаем все варианты; правильный выбирает вызывающий код, сверяясь с базой.
//
// Вход приводится к нижнему регистру: URL приходит в произвольном регистре, и без
// нормализации страница открылась бы по двум адресам без редиректа.
//
// Кандидаты упорядочены от самого короткого `a` к самому длинному.
export function splitPairSlugCandidates(pairSlug: string): PairSlugCandidate[] {
  const normalized = pairSlug.toLowerCase();
  const candidates: PairSlugCandidate[] = [];
  let index = normalized.indexOf(PAIR_SEPARATOR);

  while (index !== -1) {
    const a = normalized.slice(0, index);
    const b = normalized.slice(index + PAIR_SEPARATOR.length);

    if (a && b) {
      candidates.push({ a, b });
    }

    index = normalized.indexOf(PAIR_SEPARATOR, index + 1);
  }

  return candidates;
}
