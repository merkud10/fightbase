// Упоминание бойца в русском тексте по основам имени — для привязки бойцов к
// статьям (lib/ingestion.ts). Основы усечены под склонения: «Махачева»,
// «Махачеву» совпадают с «Махачев».
//
// Прежняя версия искала основы подстрокой и не требовала, чтобы каждая основа
// нашла своё слово. У «Аскар Аскаров» обе основы — «аскар», поэтому одного слова
// «Аскаров» (менеджер Али Аскаров в новости о Гнездицком) хватало, чтобы статья
// привязалась и к Аскару Аскарову, и к Аскару Аскару. По неверной привязке в
// «Читайте также» попадали посторонние материалы.

export function russianNameStems(nameRu: string): string[] {
  const stems: string[] = [];

  for (const word of nameRu.toLowerCase().replace(/ё/g, "е").trim().split(/\s+/)) {
    if (word.length >= 7) {
      stems.push(word.slice(0, -2));
    } else if (word.length >= 6) {
      stems.push(word.slice(0, -1));
    } else if (word.length >= 5) {
      stems.push(word);
    }
  }

  return stems;
}

type TextWord = { value: string; index: number };

function splitWords(normalizedText: string): TextWord[] {
  const words: TextWord[] = [];
  for (const match of normalizedText.replace(/ё/g, "е").matchAll(/\S+/g)) {
    words.push({ value: match[0], index: match.index ?? 0 });
  }
  return words;
}

// Слово начинается с основы; у составного слова («экс-чемпион») — любая часть.
function wordStartsWith(word: string, stem: string) {
  return word.startsWith(stem) || word.split("-").some((part) => part.startsWith(stem));
}

const MAX_NAME_SPAN = 80;

// normalizedText — результат normalizeComparableText: нижний регистр, слова через пробел.
export function textMentionsRussianName(nameRu: string, normalizedText: string): boolean {
  const stems = russianNameStems(nameRu);
  if (stems.length === 0) return false;

  const words = splitWords(normalizedText);

  if (stems.length === 1) {
    const stem = stems[0] ?? "";
    return stem.length >= 6 && words.some((word) => wordStartsWith(word.value, stem));
  }

  // Каждой основе нужно своё слово, и все слова должны стоять рядом.
  const candidates = stems.map((stem) => words.map((word, index) => (wordStartsWith(word.value, stem) ? index : -1)).filter((index) => index >= 0));
  if (candidates.some((list) => list.length === 0)) return false;

  const pick = (stemIndex: number, used: number[]): boolean => {
    if (stemIndex === stems.length) {
      const positions = used.map((index) => words[index]?.index ?? 0);
      return Math.max(...positions) - Math.min(...positions) <= MAX_NAME_SPAN;
    }
    return (candidates[stemIndex] ?? []).some((index) => !used.includes(index) && pick(stemIndex + 1, [...used, index]));
  };

  return pick(0, []);
}

// «Аскар Аскар» целиком содержится в начале «Аскар Аскаров»: упоминание второго
// находит и первого. Если совпали оба, оставляем бойца с более длинным именем.
export function dropPrefixShadowedFighters<T extends { name: string; nameRu?: string | null }>(fighters: readonly T[]): T[] {
  const key = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const isStrictPrefix = (short: string, long: string) => short.length > 0 && long.length > short.length && long.startsWith(short);

  return fighters.filter(
    (fighter) =>
      !fighters.some(
        (other) =>
          other !== fighter &&
          (isStrictPrefix(key(fighter.name), key(other.name)) || isStrictPrefix(key(fighter.nameRu), key(other.nameRu)))
      )
  );
}
