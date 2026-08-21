export const PAIR_SEPARATOR = "-vs-";

// Тип кандидата разбора — экспортируется, чтобы вызывающий код не дублировал его.
export type PairSlugCandidate = { a: string; b: string };

export function buildPairSlug(slugA: string, slugB: string) {
  // Побайтовое сравнение операторами < / >: результат одинаков во всех сборках Node
  // независимо от версии ICU. localeCompare не подходит, потому что его результат
  // зависит от полноты ICU-данных в конкретном бинаре, а этот порядок запекается
  // в канонические URL и sitemap — смена порядка означала бы массовую переиндексацию.
  // Слаги содержат только [a-z0-9-], locale-sensitive collation тут не нужна.
  //
  // ВАЖНО: порядок нельзя менять. Он запечён в канонические URL и sitemap;
  // любое изменение = массовая переиндексация раздела сравнения.
  const [first, second] = [slugA, slugB].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return `${first}${PAIR_SEPARATOR}${second}`;
}

export function isCanonicalPairOrder(slugA: string, slugB: string) {
  return buildPairSlug(slugA, slugB) === `${slugA}${PAIR_SEPARATOR}${slugB}`;
}

// Слаг бойца теоретически может содержать "-vs-", поэтому разрез неоднозначен.
// Возвращаем все варианты; правильный выбирает вызывающий код, сверяясь с базой.
//
// Входная строка приводится к нижнему регистру: URL может прийти в произвольном
// регистре, а лукап в базе — регистронезависим. Без нормализации страница открылась
// бы по двум адресам без редиректа, что создаёт ровно тот дубль, который раздел
// исключает. После нормализации сборка канонического слага из слагов базы (всегда
// нижний регистр) не совпадёт с исходным URL и вызовет корректный 308.
//
// Кандидаты упорядочены от самого короткого `a` к самому длинному:
// первый разрез всегда даёт наименьший `a` и наибольший `b`.
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
