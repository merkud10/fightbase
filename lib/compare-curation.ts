import { PAIR_SEPARATOR } from "@/lib/compare-pairs";
import { looksLikeLowQualitySlug } from "@/lib/sitemap-entries";
import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

export type CuratedPair = {
  pairSlug: string;
  slugA: string;
  slugB: string;
  weightClass: string | null;
  hasFight: boolean;
  isScheduled: boolean;
};

export type FightPairInput = {
  slugA: string;
  slugB: string;
  isScheduled: boolean;
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
  const add = (rawA: string, rawB: string, weightClass: string | null, fight: FightPairInput | null) => {
    if (rawA === rawB) {
      return;
    }

    const sorted = [rawA, rawB].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const slugA = sorted[0] as string;
    const slugB = sorted[1] as string;
    const pairSlug = `${slugA}${PAIR_SEPARATOR}${slugB}`;
    const existing = byPairSlug.get(pairSlug);

    if (existing) {
      // Пара может прийти и из рейтинга, и из боя — флаги боя не теряем.
      existing.hasFight = existing.hasFight || Boolean(fight);
      existing.isScheduled = existing.isScheduled || Boolean(fight?.isScheduled);
      // weightClass может отсутствовать у пары из боя; сохраняем первый ненулевой.
      existing.weightClass = existing.weightClass ?? weightClass;
      return;
    }

    byPairSlug.set(pairSlug, {
      pairSlug,
      slugA,
      slugB,
      weightClass,
      hasFight: Boolean(fight),
      isScheduled: Boolean(fight?.isScheduled)
    });
  };

  for (const group of groups) {
    const names = [group.champion.name, ...group.rows.map((row) => row.name)];
    const slugs = names.map((name) => resolveSlug(name)).filter(isUsableSlug);
    // Дедупликация нужна, если один боец попал в rows и как чемпион одновременно.
    const unique = [...new Set(slugs)];

    for (let i = 0; i < unique.length; i += 1) {
      const a = unique[i];
      if (!a) continue;
      for (let j = i + 1; j < unique.length; j += 1) {
        const b = unique[j];
        if (!b) continue;
        add(a, b, group.title, null);
      }
    }
  }

  for (const fight of fightPairs) {
    if (!isUsableSlug(fight.slugA) || !isUsableSlug(fight.slugB)) {
      continue;
    }

    add(fight.slugA, fight.slugB, null, fight);
  }

  return [...byPairSlug.values()];
}
