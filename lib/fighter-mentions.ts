// Автолинковка бойцов в тексте статьи: находит первое упоминание полного имени
// (с учётом русских склонений через гибкие окончания слов) и режет абзац на
// сегменты текст/ссылка. Каждый боец линкуется один раз на статью — состояние
// передаётся через alreadyLinked.

export type MentionFighter = {
  slug: string;
  name: string;
  nameRu?: string | null;
};

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "fighter"; value: string; slug: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Слово с гибким окончанием: у кириллических слов от 5 букв отбрасываем последнюю
// и допускаем до трёх букв окончания («Оливейра» -> «Оливейры», «Махачев» -> «Махачевым»).
function wordPattern(word: string) {
  const isCyrillic = /[а-яё]/i.test(word);
  if (isCyrillic && word.length >= 5) {
    return `${escapeRegExp(word.slice(0, -1))}[а-яё]{0,3}`;
  }
  if (isCyrillic) {
    return `${escapeRegExp(word)}[а-яё]{0,2}`;
  }
  return escapeRegExp(word);
}

function buildNamePattern(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    // Одиночное имя не линкуем: слишком высокая цена ложного срабатывания.
    return null;
  }
  const body = words.map(wordPattern).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
}

export function segmentFighterMentions(
  text: string,
  fighters: MentionFighter[],
  alreadyLinked: Set<string>
): MentionSegment[] {
  type Candidate = { slug: string; index: number; length: number };

  const candidates: Candidate[] = [];
  for (const fighter of fighters) {
    if (alreadyLinked.has(fighter.slug)) {
      continue;
    }
    const displayName = fighter.nameRu?.trim() || fighter.name.trim();
    const pattern = buildNamePattern(displayName);
    if (!pattern) {
      continue;
    }
    const match = pattern.exec(text);
    if (match && match[0]) {
      candidates.push({ slug: fighter.slug, index: match.index, length: match[0].length });
    }
  }

  if (candidates.length === 0) {
    return [{ type: "text", value: text }];
  }

  candidates.sort((a, b) => a.index - b.index);

  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const candidate of candidates) {
    if (candidate.index < cursor) {
      continue; // пересечение с уже слинкованным фрагментом
    }
    if (candidate.index > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, candidate.index) });
    }
    segments.push({
      type: "fighter",
      value: text.slice(candidate.index, candidate.index + candidate.length),
      slug: candidate.slug
    });
    alreadyLinked.add(candidate.slug);
    cursor = candidate.index + candidate.length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }

  return segments;
}
