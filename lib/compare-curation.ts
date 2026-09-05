import { buildPairSlug, sortSlugPair } from "@/lib/compare-pairs";
import { getBaseWeightClass } from "@/lib/display";
import { looksLikeLowQualitySlug } from "@/lib/sitemap-entries";
import { isPoundForPoundRankingGroup, type UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

// У части боёв вес записан заглушкой. Такое значение не должно становиться
// заголовком секции на хабе — пара уходит в группу «Другие пары».
const PLACEHOLDER_WEIGHT_CLASS = /^(unknown|tbd|tba|n\/a|-)$/i;

export function normalizeCuratedWeightClass(value: string | null | undefined) {
  const cleaned = getBaseWeightClass(String(value || ""));

  return cleaned && !PLACEHOLDER_WEIGHT_CLASS.test(cleaned) ? cleaned : null;
}

export type CuratedPair = {
  pairSlug: string;
  slugA: string;
  slugB: string;
  weightClass: string | null;
  hasFight: boolean;
  isScheduled: boolean;
  // Худшая из двух рейтинговых позиций: чемпион — 0, боец под номером N — N.
  // null означает, что пара пришла не из рейтинга, а из карточки боя.
  rankDepth: number | null;
};

// До какой позиции рейтинга пара считается достаточно интересной для индекса.
// Сначала стоял порог 5 (чемпион + первая пятёрка) из опасения наплодить
// одинаковые страницы. Логи nginx за 22.08–05.09.2026 показали обратное:
// из 975 поисковых заходов на сравнения 437 пришлись на 385 пар с позициями
// 6–15, закрытых от индекса, — запросы вида «Амосов vs Делла Маддалена».
// Весь курируемый набор и так линкуется со страниц бойцов, поэтому индексируем
// его целиком: это чемпион и вся пятнадцатка каждого дивизиона.
export const COMPARE_INDEX_RANK_DEPTH = 15;

// Хаб показывает все курируемые пары, но в sitemap и в индекс пускаем только те,
// у которых есть собственный повод существовать: очная встреча (состоявшаяся или
// назначенная) либо верх рейтинга. hasFight покрывает и запланированные бои —
// isScheduled без hasFight не бывает.
//
// Сначала здесь стояло isScheduled вместо hasFight, из расчёта что прошедший бой
// уже описан страницей события. Search Console это опроверг: показы шли как раз
// по парам с прошедшим боем и бойцами вне топа рейтинга — по запросам вида
// «X vs Y», то есть ровно по назначению раздела.
export function isIndexableComparisonPair(pair: CuratedPair) {
  return pair.hasFight || (pair.rankDepth !== null && pair.rankDepth <= COMPARE_INDEX_RANK_DEPTH);
}

export type FightPairInput = {
  slugA: string;
  slugB: string;
  isScheduled: boolean;
  weightClass: string | null;
};

type BuildCuratedPairsInput = {
  groups: UfcOfficialRankingGroup[];
  fightPairs: FightPairInput[];
  resolveSlug: (name: string) => string | null;
};

function isUsableSlug(slug: string | null | undefined): slug is string {
  return Boolean(slug) && !looksLikeLowQualitySlug(slug as string);
}

export function buildCuratedPairs({ groups, fightPairs, resolveSlug }: BuildCuratedPairsInput): CuratedPair[] {
  const byPairSlug = new Map<string, CuratedPair>();

  // Канонический порядок получаем той же сортировкой, что buildPairSlug,
  // а не обратным разбором строки: слаг бойца может содержать PAIR_SEPARATOR,
  // и split("-vs-") дал бы неоднозначный результат.
  const add = (
    rawA: string,
    rawB: string,
    weightClass: string | null,
    fight: FightPairInput | null,
    rankDepth: number | null
  ) => {
    if (rawA === rawB) {
      return;
    }

    const [slugA, slugB] = sortSlugPair(rawA, rawB);
    const pairSlug = buildPairSlug(slugA, slugB);
    const existing = byPairSlug.get(pairSlug);

    if (existing) {
      // Пара может прийти и из рейтинга, и из боя — флаги боя не теряем.
      existing.hasFight = existing.hasFight || Boolean(fight);
      existing.isScheduled = existing.isScheduled || Boolean(fight?.isScheduled);
      // weightClass может отсутствовать у пары из боя; сохраняем первый ненулевой.
      existing.weightClass = existing.weightClass ?? weightClass;
      // Один боец может стоять в рейтинге двух дивизионов: оставляем позицию
      // повыше, иначе пара потеряет право на индекс из-за второго дивизиона.
      if (rankDepth !== null) {
        existing.rankDepth = existing.rankDepth === null ? rankDepth : Math.min(existing.rankDepth, rankDepth);
      }
      return;
    }

    byPairSlug.set(pairSlug, {
      pairSlug,
      slugA,
      slugB,
      weightClass,
      hasFight: Boolean(fight),
      isScheduled: Boolean(fight?.isScheduled),
      rankDepth
    });
  };

  for (const group of groups) {
    // P4P-рейтинг сводит бойцов из разных дивизионов: такие пары в курируемый
    // набор не входят, иначе в индекс уехали бы сотни междивизионных страниц.
    if (isPoundForPoundRankingGroup(group.title)) {
      continue;
    }

    // Заголовок группы и вес боя попадают в одно поле weightClass, поэтому
    // приводим их одним словарём: иначе «Легкий вес» и Lightweight разъедутся
    // на хабе в две секции одного дивизиона.
    const weightClass = normalizeCuratedWeightClass(group.title);
    const ranked = [
      { name: group.champion.name, depth: 0 },
      ...group.rows.map((row) => ({ name: row.name, depth: row.rank }))
    ];
    // Дедупликация нужна, если один боец попал в rows и как чемпион одновременно;
    // за бойцом оставляем лучшую (меньшую) из его позиций.
    const depthBySlug = new Map<string, number>();
    for (const entry of ranked) {
      const slug = resolveSlug(entry.name);
      if (!isUsableSlug(slug)) {
        continue;
      }
      const known = depthBySlug.get(slug);
      depthBySlug.set(slug, known === undefined ? entry.depth : Math.min(known, entry.depth));
    }

    const unique = [...depthBySlug.keys()];
    for (let i = 0; i < unique.length; i += 1) {
      const a = unique[i];
      if (!a) continue;
      for (let j = i + 1; j < unique.length; j += 1) {
        const b = unique[j];
        if (!b) continue;
        // Пара не сильнее слабейшего из двух: сравнение чемпиона с 14-м номером
        // такая же периферия, как и пара двух четырнадцатых.
        add(a, b, weightClass, null, Math.max(depthBySlug.get(a) ?? 0, depthBySlug.get(b) ?? 0));
      }
    }
  }

  for (const fight of fightPairs) {
    if (!isUsableSlug(fight.slugA) || !isUsableSlug(fight.slugB)) {
      continue;
    }

    add(fight.slugA, fight.slugB, fight.weightClass, fight, null);
  }

  return [...byPairSlug.values()];
}
