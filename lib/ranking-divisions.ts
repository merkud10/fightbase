// Дивизионы официального рейтинга UFC и их постоянные адреса /rankings/<slug>.
// Снимок рейтинга хранит русские заголовки («Легкий вес»), свежий парсер
// ufc.com — английские («Lightweight»): узнаём оба. По Яндекс.Метрике и GSC
// (сентябрь 2026) рейтинг ищут по дивизионам — «рейтинг юфс легкий вес»,
// «все бойцы ufc в легком весе список», — а единая /rankings висела в Google
// на 44-й позиции.

export type RankingDivision = {
  slug: string;
  // Как дивизион звучит в заголовке: «в легком весе», «в женском минимальном весе».
  ruIn: string;
  ruTitle: string;
  enTitle: string;
  poundForPound: boolean;
  aliases: string[];
};

function division(slug: string, ruTitle: string, ruIn: string, enTitle: string, extra: string[] = []): RankingDivision {
  return {
    slug,
    ruTitle,
    ruIn,
    enTitle,
    poundForPound: slug.endsWith("pound-for-pound"),
    aliases: [ruTitle, enTitle, ...extra]
  };
}

export const RANKING_DIVISIONS: RankingDivision[] = [
  division("pound-for-pound", "P4P: вне весовых категорий", "вне весовых категорий (P4P)", "Men's Pound-for-Pound", [
    "Вне зависимости от категорий",
    "Pound-for-Pound"
  ]),
  division("flyweight", "Наилегчайший вес", "в наилегчайшем весе", "Flyweight"),
  division("bantamweight", "Легчайший вес", "в легчайшем весе", "Bantamweight"),
  division("featherweight", "Полулегкий вес", "в полулегком весе", "Featherweight"),
  division("lightweight", "Легкий вес", "в легком весе", "Lightweight"),
  division("welterweight", "Полусредний вес", "в полусреднем весе", "Welterweight"),
  division("middleweight", "Средний вес", "в среднем весе", "Middleweight"),
  division("light-heavyweight", "Полутяжелый вес", "в полутяжелом весе", "Light Heavyweight"),
  division("heavyweight", "Тяжелый вес", "в тяжелом весе", "Heavyweight"),
  division("womens-pound-for-pound", "Женский P4P: вне весовых категорий", "среди женщин вне весовых категорий (P4P)", "Women's Pound-for-Pound", [
    "Женский, вне весовых категорий"
  ]),
  division("womens-strawweight", "Женский минимальный вес", "в женском минимальном весе", "Women's Strawweight"),
  division("womens-flyweight", "Женский наилегчайший вес", "в женском наилегчайшем весе", "Women's Flyweight"),
  division("womens-bantamweight", "Женский легчайший вес", "в женском легчайшем весе", "Women's Bantamweight"),
  division("womens-featherweight", "Женский полулегкий вес", "в женском полулегком весе", "Women's Featherweight")
];

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+top rank$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const byAlias = new Map(
  RANKING_DIVISIONS.flatMap((item) => item.aliases.map((alias) => [normalizeTitle(alias), item] as const))
);
const bySlug = new Map(RANKING_DIVISIONS.map((item) => [item.slug, item]));

export function findRankingDivision(title: string): RankingDivision | null {
  return byAlias.get(normalizeTitle(title)) ?? null;
}

export function getRankingDivisionBySlug(slug: string): RankingDivision | null {
  return bySlug.get(slug) ?? null;
}
