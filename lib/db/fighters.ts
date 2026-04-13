
import type { FighterStatus, Prisma } from "@prisma/client";
import { cache } from "react";

import { getWeightClassFilterValues, isUsablePhoto, normalizeWeightClassValue } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "./articles";

export type FightersPageFilters = {
  query?: string;
  promotion?: string;
  status?: string;
  weightClass?: string;
  page?: number;
  perPage?: number;
};

export type RankingsPageFilters = {
  promotion?: string;
};

export type UfcOfficialRankingLink = {
  localSlug?: string;
  officialUrl: string;
  photoUrl?: string | null;
};

export type PromotionRankingLink = {
  localSlug?: string;
  photoUrl?: string | null;
};

export type PromotionRankingLinkEntry = {
  localSlug: string;
  photoUrl?: string | null;
  name: string;
  nameRu?: string | null;
};

export type FighterListItem = Prisma.FighterGetPayload<{
  include: {
    promotion: true;
  };
}>;

function normalizeProfileKey(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function tokenizeProfileValue(value: string | null | undefined) {
  return normalizeProfileKey(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

const BROKEN_UFC_PROFILE_SLUGS = new Set([
  "chandler-cole"
]);

function looksLikeBrokenUfcProfile(fighter: FighterListItem) {
  if (fighter.promotion?.slug !== "ufc") {
    return false;
  }

  if (BROKEN_UFC_PROFILE_SLUGS.has(fighter.slug)) {
    return true;
  }

  const slugTokens = tokenizeProfileValue(fighter.slug.replace(/-\d+$/g, "").replace(/-/g, " "));
  const nameTokens = tokenizeProfileValue(fighter.name);
  const overlap = slugTokens.filter((token) => nameTokens.includes(token)).length;
  const lacksCoreData =
    !fighter.photoUrl ||
    (!fighter.age && !fighter.heightCm && !fighter.reachCm) ||
    (!fighter.strikeAccuracy && !fighter.strikeDefense && !fighter.takedownAccuracy && !fighter.takedownDefense && !fighter.averageFightTime);
  const articleLikeSlug = /i-am-still-here|wants-this|journey-continues|ufc-|vegas|edmonton|mexico-city/i.test(fighter.slug);

  return articleLikeSlug || (slugTokens.length > 1 && nameTokens.length > 1 && overlap === 0 && lacksCoreData);
}

function getFighterQualityScore(fighter: FighterListItem) {
  let score = 0;

  if (isUsablePhoto(fighter.photoUrl)) score += 10;
  if (fighter.nameRu) score += 2;
  if (fighter.record && fighter.record !== "0-0" && fighter.record !== "0-0-0") score += 3;
  if (fighter.age) score += 2;
  if (fighter.heightCm) score += 2;
  if (fighter.reachCm) score += 2;
  if (fighter.strikeAccuracy != null) score += 2;
  if (fighter.strikeDefense != null) score += 2;
  if (fighter.takedownAccuracy != null) score += 2;
  if (fighter.takedownDefense != null) score += 2;
  if (fighter.averageFightTime) score += 1;
  if (fighter.status === "champion") score += 3;
  if (fighter.status === "active") score += 2;
  if (fighter.status === "prospect") score += 1;
  if (looksLikeBrokenUfcProfile(fighter)) score -= 20;

  return score;
}

function hasMeaningfulFighterProfileData(fighter: FighterListItem & { _count?: { recentFights: number } }) {
  const hasVitals = Boolean(fighter.age || fighter.heightCm || fighter.reachCm);
  const hasStats = Boolean(
    fighter.strikeAccuracy != null ||
      fighter.strikeDefense != null ||
      fighter.takedownAccuracy != null ||
      fighter.takedownDefense != null ||
      fighter.sigStrikesLandedPerMin != null ||
      fighter.sigStrikesAbsorbedPerMin != null ||
      fighter.takedownAveragePer15 != null ||
      fighter.submissionAveragePer15 != null ||
      fighter.averageFightTime
  );
  const hasHistory = Boolean(fighter._count?.recentFights);

  return hasVitals || hasStats || hasHistory;
}

export function dedupeFightersForPublicList(fighters: Array<FighterListItem & { _count?: { recentFights: number } }>) {
  const grouped = new Map<string, FighterListItem[]>();

  for (const fighter of fighters) {
    if (looksLikeBrokenUfcProfile(fighter)) {
      continue;
    }

    if (!isUsablePhoto(fighter.photoUrl)) {
      continue;
    }

    if (fighter.promotion?.slug === "ufc" && !hasMeaningfulFighterProfileData(fighter)) {
      continue;
    }

    const key = normalizeProfileKey(fighter.nameRu || fighter.name);
    const collection = grouped.get(key) ?? [];
    collection.push(fighter);
    grouped.set(key, collection);
  }

  return Array.from(grouped.values())
    .map((group) =>
      [...group].sort((left, right) => {
        const qualityDiff = getFighterQualityScore(right) - getFighterQualityScore(left);
        if (qualityDiff !== 0) {
          return qualityDiff;
        }

        return left.name.localeCompare(right.name);
      })[0]
    )
    .filter((fighter): fighter is FighterListItem => Boolean(fighter))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status.localeCompare(right.status);
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getRankingsPageData() {
  return prisma.fighter.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      promotion: true
    },
    take: 500
  });
}

function getWeightClassOrder(value: string) {
  const order = [
    "Strawweight",
    "Flyweight",
    "Bantamweight",
    "Featherweight",
    "Lightweight",
    "Welterweight",
    "Middleweight",
    "Light Heavyweight",
    "Heavyweight",
    "Catchweight",
    "Openweight"
  ];

  const index = order.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? order.length : index;
}

function parseRecordScore(record: string | null | undefined) {
  const clean = String(record || "").trim();
  const match = clean.match(/^(\d+)-(\d+)(?:-(\d+))?$/);

  if (!match) {
    return { wins: -1, losses: 99, draws: 99, total: -1 };
  }

  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const draws = Number(match[3] || 0);

  return {
    wins,
    losses,
    draws,
    total: wins + losses + draws
  };
}

function isPlaceholderRecentFightValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "opponent not listed",
    "result pending",
    "соперник не указан",
    "результат уточняется"
  ].includes(normalized);
}

export async function getPromotionRankingsPageData(filters: RankingsPageFilters = {}) {
  const promotions = await prisma.promotion.findMany({
    where: {
      slug: {
        in: ["ufc"]
      }
    },
    orderBy: { shortName: "asc" },
    select: { slug: true, shortName: true, name: true }
  });

  const selectedPromotion = promotions.find((promotion) => promotion.slug === "ufc")?.slug ?? promotions[0]?.slug ?? "";

  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: selectedPromotion },
      status: { in: ["active", "champion", "prospect"] }
    },
    include: {
      promotion: true
    },
    take: 500
  });

  const groupedMap = new Map<string, typeof fighters>();

  for (const fighter of fighters) {
    const key = fighter.weightClass || "Openweight";
    const collection = groupedMap.get(key) ?? [];
    collection.push(fighter);
    groupedMap.set(key, collection);
  }

  const rankingsByWeight = Array.from(groupedMap.entries())
    .map(([weightClass, weightFighters]) => {
      const rankedFighters = [...weightFighters].sort((left, right) => {
        const leftChampion = left.status === "champion" ? 1 : 0;
        const rightChampion = right.status === "champion" ? 1 : 0;
        if (leftChampion !== rightChampion) {
          return rightChampion - leftChampion;
        }

        const leftRecord = parseRecordScore(left.record);
        const rightRecord = parseRecordScore(right.record);
        if (leftRecord.wins !== rightRecord.wins) {
          return rightRecord.wins - leftRecord.wins;
        }
        if (leftRecord.losses !== rightRecord.losses) {
          return leftRecord.losses - rightRecord.losses;
        }
        if (leftRecord.total !== rightRecord.total) {
          return rightRecord.total - leftRecord.total;
        }

        return left.name.localeCompare(right.name);
      });

      return {
        weightClass,
        fighters: rankedFighters
      };
    })
    .sort((left, right) => getWeightClassOrder(left.weightClass) - getWeightClassOrder(right.weightClass));

  return {
    promotions,
    selectedPromotion,
    rankingsByWeight
  };
}

export async function getUfcOfficialRankingLinks() {
  const fighters = await prisma.fighter.findMany({
    select: {
      slug: true,
      name: true,
      nameRu: true,
      photoUrl: true,
      promotion: {
        select: {
          slug: true
        }
      }
    }
  });

  const bySlug = new Map<string, UfcOfficialRankingLink>();
  const byName = new Map<string, UfcOfficialRankingLink>();

  for (const fighter of fighters) {
    const link = {
      localSlug: fighter.slug,
      officialUrl: `https://www.ufc.com/athlete/${fighter.slug}`,
      photoUrl: fighter.photoUrl
    };
    const isUfcFighter = fighter.promotion?.slug === "ufc";
    const existingBySlug = bySlug.get(fighter.slug.toLowerCase());
    const existingByName = byName.get(fighter.name.toLowerCase());

    if (!existingBySlug || isUfcFighter) {
      bySlug.set(fighter.slug.toLowerCase(), link);
    }
    if (!existingByName || isUfcFighter) {
      byName.set(fighter.name.toLowerCase(), link);
    }
    if (fighter.nameRu) {
      const existingByRuName = byName.get(fighter.nameRu.toLowerCase());
      if (!existingByRuName || isUfcFighter) {
        byName.set(fighter.nameRu.toLowerCase(), link);
      }
    }
  }

  return { bySlug, byName };
}

export async function getPromotionRankingLinks(promotionSlug: string) {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: promotionSlug
      }
    },
    select: {
      slug: true,
      name: true,
      nameRu: true,
      photoUrl: true
    }
  });

  const bySlug = new Map<string, PromotionRankingLink>();
  const byName = new Map<string, PromotionRankingLink>();
  const entries: PromotionRankingLinkEntry[] = [];

  for (const fighter of fighters) {
    const link = {
      localSlug: fighter.slug,
      photoUrl: fighter.photoUrl
    };

    bySlug.set(fighter.slug.toLowerCase(), link);
    byName.set(fighter.name.toLowerCase(), link);

    if (fighter.nameRu) {
      byName.set(fighter.nameRu.toLowerCase(), link);
    }

    entries.push({
      localSlug: fighter.slug,
      photoUrl: fighter.photoUrl,
      name: fighter.name,
      nameRu: fighter.nameRu
    });
  }

  return { bySlug, byName, entries };
}

const FIGHTERS_PER_PAGE = 36;

function normalizeFighterSearchValue(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function matchesFighterSearch(
  fighter: Pick<FighterListItem, "name" | "nameRu" | "nickname">,
  normalizedQuery: string
) {
  if (!normalizedQuery) {
    return true;
  }

  return [fighter.name, fighter.nameRu, fighter.nickname]
    .map((value) => normalizeFighterSearchValue(value))
    .some((value) => value.includes(normalizedQuery));
}

export const getFightersPageData = cache(async function getFightersPageData(filters: FightersPageFilters = {}) {
  const query = filters.query?.trim();
  const normalizedQuery = normalizeFighterSearchValue(query);
  const validStatuses: FighterStatus[] = ["active", "champion", "retired", "prospect"];
  const normalizedStatus = validStatuses.includes(filters.status as FighterStatus)
    ? (filters.status as FighterStatus)
    : undefined;
  const normalizedWeightClass = filters.weightClass ? normalizeWeightClassValue(filters.weightClass) : undefined;
  const promotionSlug = "ufc";

  const fightersWhere: Prisma.FighterWhereInput = {
    AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }],
    promotion: { slug: promotionSlug },
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(normalizedWeightClass ? { weightClass: { in: getWeightClassFilterValues(normalizedWeightClass) } } : {})
  };

  const perPage = filters.perPage ?? FIGHTERS_PER_PAGE;
  const page = Math.max(1, filters.page ?? 1);

  const [fighters, promotions, weightClasses] = await Promise.all([
    prisma.fighter.findMany({
      where: fightersWhere,
      orderBy: [{ status: "asc" }, { photoUrl: "desc" }, { name: "asc" }],
      include: {
        promotion: true,
        _count: {
          select: {
            recentFights: true
          }
        }
      }
    }),
    prisma.promotion.findMany({
      where: {
        slug: "ufc"
      },
      orderBy: { shortName: "asc" },
      select: { slug: true, shortName: true, name: true }
    }),
    prisma.fighter.findMany({
      distinct: ["weightClass"],
      where: {
        promotion: { slug: promotionSlug },
        AND: [{ weightClass: { not: "" } }]
      },
      orderBy: { weightClass: "asc" },
      select: { weightClass: true }
    })
  ]);

  const filteredFighters = normalizedQuery
    ? fighters.filter((fighter) => matchesFighterSearch(fighter, normalizedQuery))
    : fighters;
  const allFighters = dedupeFightersForPublicList(filteredFighters);
  const totalCount = allFighters.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedFighters = allFighters.slice((safePage - 1) * perPage, safePage * perPage);

  return {
    fighters: paginatedFighters,
    totalCount,
    page: safePage,
    totalPages,
    filters: {
      query: query ?? "",
      promotion: promotionSlug,
      status: filters.status ?? "",
      weightClass: normalizedWeightClass ?? ""
    },
    options: {
      promotions,
      weightClasses: Array.from(new Set(weightClasses.map((item) => normalizeWeightClassValue(item.weightClass)).filter(Boolean))),
      statuses: ["active", "champion", "retired", "prospect"] as const
    }
  };
});

export const getFighterPageData = cache(async function getFighterPageData(slug: string) {
  const fighter = await prisma.fighter.findUnique({
    where: { slug },
    include: {
      promotion: true
    }
  });

  if (!fighter) {
    return null;
  }

  if (looksLikeBrokenUfcProfile(fighter)) {
    return null;
  }

  const [recentFights, profileRecentFights, relatedArticles] = await Promise.all([
    prisma.fight.findMany({
      where: {
        OR: [{ fighterAId: fighter.id }, { fighterBId: fighter.id }]
      },
      include: {
        event: true,
        fighterA: true,
        fighterB: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.fighterRecentFight.findMany({
      where: { fighterId: fighter.id },
      orderBy: { date: "desc" },
    }),
    prisma.article.findMany({
      where: {
        status: "published",
        ...buildPublicArticleImageWhere(),
        fighterMap: {
          some: { fighterId: fighter.id }
        }
      },
      orderBy: { publishedAt: "desc" },
      take: 40
    })
  ]);

  const normalizedFighterName = fighter.name.trim().toLowerCase();
  const normalizedFighterNameRu = fighter.nameRu?.trim().toLowerCase() ?? "";
  const visibleProfileRecentFights = profileRecentFights.filter((fight) => {
    const opponentName = fight.opponentName.trim().toLowerCase();
    const opponentNameRu = fight.opponentNameRu?.trim().toLowerCase() ?? "";

    if (
      isPlaceholderRecentFightValue(fight.opponentName) ||
      isPlaceholderRecentFightValue(fight.opponentNameRu) ||
      isPlaceholderRecentFightValue(fight.result)
    ) {
      return false;
    }

    if (opponentName === normalizedFighterName || (normalizedFighterNameRu && opponentNameRu === normalizedFighterNameRu)) {
      return false;
    }

    return true;
  });

  const visibleRecentFights = recentFights.filter((fight) => {
    if (!fight.event?.name?.trim()) {
      return false;
    }

    const opponent =
      fight.fighterAId === fighter.id
        ? fight.fighterB?.name
        : fight.fighterBId === fighter.id
          ? fight.fighterA?.name
          : "";

    return Boolean(String(opponent || "").trim());
  });

  return {
    fighter,
    recentFights: visibleRecentFights,
    profileRecentFights: visibleProfileRecentFights,
    relatedArticles: relatedArticles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)).slice(0, 20)
  };
});
