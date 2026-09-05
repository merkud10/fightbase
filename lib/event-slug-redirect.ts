// Восстановление адресов после переименований. Синки меняют слаги турниров
// («ufc-330» → «ufc-330-makhachev-vs-machado-garry») и боёв (дубль бойца
// «michael-venom-page» → «michael-page»), а старые адреса уже в выдаче Google.
// Здесь чистые правила подбора; запросы к базе — в lib/db/events.ts.

// Префиксы, по которым старый слаг турнира может найти новый: сам старый слаг
// с дефисом (к нему добавили главный бой или суффикс «-2») и, для номерных
// турниров, номер («ufc-333-»), потому что главный бой могли заменить целиком.
export function eventSlugPrefixCandidates(slug: string): string[] {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const candidates = [`${normalized}-`];
  const numbered = normalized.match(/^(ufc-\d+)(?:-|$)/);
  if (numbered && numbered[1] !== normalized) {
    candidates.push(`${numbered[1]}-`);
  }
  return candidates;
}

const IGNORED_TOKENS = new Set(["vs", "jr", "ii", "iii", "the"]);

function tokens(slug: string) {
  return new Set(
    slug
      .toLowerCase()
      .split("-")
      .filter((token) => token.length >= 3 && !IGNORED_TOKENS.has(token))
  );
}

// Среди боёв турнира ищет тот, чей слаг делит со старым не меньше двух
// значимых токенов (обычно фамилии обоих бойцов). Ничья по счёту — отказ:
// лучше отправить на страницу турнира, чем на чужой бой.
export function pickFightSlugByTokens(oldFightSlug: string, candidateSlugs: readonly string[]): string | null {
  const wanted = tokens(oldFightSlug);
  if (wanted.size === 0) {
    return null;
  }
  let best: { slug: string; score: number } | null = null;
  let tie = false;
  for (const candidate of candidateSlugs) {
    if (candidate === oldFightSlug) {
      return candidate;
    }
    let score = 0;
    for (const token of tokens(candidate)) {
      if (wanted.has(token)) {
        score += 1;
      }
    }
    if (!best || score > best.score) {
      best = { slug: candidate, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  if (!best || tie || best.score < 2) {
    return null;
  }
  return best.slug;
}
