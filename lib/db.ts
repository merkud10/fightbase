import type { ArticleStatus, EventStatus, FighterStatus, Prisma } from "@prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

type AdminModerationSort = "newest" | "aiDesc" | "aiAsc";

type AdminDashboardFilters = {
  status?: ArticleStatus;
  aiOnly?: boolean;
  minConfidence?: number;
  sort?: AdminModerationSort;
};

type FightersPageFilters = {
  query?: string;
  promotion?: string;
  status?: string;
  weightClass?: string;
};

type NewsPageFilters = {
  promotion?: string;
  tag?: string;
};

type EventsPageFilters = {
  promotion?: string;
  status?: string;
};

type RankingsPageFilters = {
  promotion?: string;
};

type UfcOfficialRankingLink = {
  localSlug?: string;
  officialUrl: string;
  photoUrl?: string | null;
};

type PromotionRankingLink = {
  localSlug?: string;
  photoUrl?: string | null;
};

type PromotionRankingLinkEntry = {
  localSlug: string;
  photoUrl?: string | null;
  name: string;
  nameRu?: string | null;
};

type FighterListItem = Prisma.FighterGetPayload<{
  include: {
    promotion: true;
  };
}>;

function getArticleOrderBy(sort: AdminModerationSort) {
  switch (sort) {
    case "aiDesc":
      return [{ aiConfidence: "desc" as const }, { publishedAt: "desc" as const }];
    case "aiAsc":
      return [{ aiConfidence: "asc" as const }, { publishedAt: "desc" as const }];
    case "newest":
    default:
      return [{ publishedAt: "desc" as const }];
  }
}

function normalizeProfileKey(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function hasUsablePhotoUrl(value: string | null | undefined) {
  const url = String(value || "").trim();
  if (!url) {
    return false;
  }

  return !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(url);
}

function tokenizeProfileValue(value: string | null | undefined) {
  return normalizeProfileKey(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function looksLikeBrokenUfcProfile(fighter: FighterListItem) {
  if (fighter.promotion?.slug !== "ufc") {
    return false;
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

  if (hasUsablePhotoUrl(fighter.photoUrl)) score += 10;
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

function dedupeFightersForPublicList(fighters: Array<FighterListItem & { _count?: { recentFights: number } }>) {
  const grouped = new Map<string, FighterListItem[]>();

  for (const fighter of fighters) {
    if (looksLikeBrokenUfcProfile(fighter)) {
      continue;
    }

    if (!hasUsablePhotoUrl(fighter.photoUrl)) {
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
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status.localeCompare(right.status);
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getAdminDashboardData(filters: AdminDashboardFilters = {}) {
  const aiConfidenceFilter =
    filters.aiOnly || typeof filters.minConfidence === "number"
      ? {
          ...(filters.aiOnly ? { not: null } : {}),
          ...(typeof filters.minConfidence === "number" ? { gte: filters.minConfidence } : {})
        }
      : undefined;

  const articleWhere = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(aiConfidenceFilter ? { aiConfidence: aiConfidenceFilter } : {})
  };

  const [
    articles,
    events,
    fighters,
    sources,
    ingestionRuns,
    articleCount,
    eventCount,
    fighterCount,
    sourceCount,
    draftCount,
    reviewCount,
    publishedCount,
    aiDraftCount,
    highConfidenceDraftCount,
    lowConfidenceDraftCount,
    reviewQueueCount
  ] = await Promise.all([
    prisma.article.findMany({
      where: articleWhere,
      orderBy: getArticleOrderBy(filters.sort ?? "newest"),
      include: {
        promotion: true,
        event: true
      },
      take: 10
    }),
    prisma.event.findMany({
      orderBy: { date: "desc" },
      include: {
        promotion: true,
        fights: true
      },
      take: 10
    }),
    prisma.fighter.findMany({
      orderBy: { name: "asc" },
      include: {
        promotion: true
      },
      take: 10
    }),
    prisma.source.findMany({
      orderBy: { label: "asc" },
      take: 10
    }),
    prisma.ingestionRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 6
    }),
    prisma.article.count(),
    prisma.event.count(),
    prisma.fighter.count(),
    prisma.source.count(),
    prisma.article.count({ where: { status: "draft" } }),
    prisma.article.count({ where: { status: "review" } }),
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({ where: { status: "draft", aiConfidence: { not: null } } }),
    prisma.article.count({ where: { status: "draft", aiConfidence: { gte: 0.7 } } }),
    prisma.article.count({ where: { status: "draft", aiConfidence: { lt: 0.5 } } }),
    prisma.article.count({
      where: {
        status: { in: ["draft", "review"] },
        aiConfidence: { not: null }
      }
    })
  ]);

  return {
    counts: {
      articles: articleCount,
      events: eventCount,
      fighters: fighterCount,
      sources: sourceCount,
      drafts: draftCount,
      review: reviewCount,
      published: publishedCount,
      aiDrafts: aiDraftCount,
      highConfidenceDrafts: highConfidenceDraftCount,
      lowConfidenceDrafts: lowConfidenceDraftCount,
      reviewQueue: reviewQueueCount
    },
    articles,
    events,
    fighters,
    sources,
    ingestionRuns
  };
}

export async function getLatestIngestionRun() {
  return prisma.ingestionRun.findFirst({
    orderBy: { startedAt: "desc" }
  });
}

export async function getAdminEditorOptions() {
  const [promotions, events, fighters, tags, sources] = await Promise.all([
    prisma.promotion.findMany({ orderBy: { shortName: "asc" } }),
    prisma.event.findMany({ orderBy: { date: "desc" } }),
    prisma.fighter.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { label: "asc" } }),
    prisma.source.findMany({ orderBy: { label: "asc" } })
  ]);

  return { promotions, events, fighters, tags, sources };
}

export async function getAdminSourceEditorData(sourceId: string) {
  return prisma.source.findUnique({
    where: { id: sourceId }
  });
}

export async function getAdminFighterEditorData(fighterId: string) {
  const [fighter, promotions] = await Promise.all([
    prisma.fighter.findUnique({
      where: { id: fighterId },
      include: {
        promotion: true
      }
    }),
    prisma.promotion.findMany({ orderBy: { shortName: "asc" } })
  ]);

  return { fighter, promotions };
}

export async function getAdminEventEditorData(eventId: string) {
  const [event, promotions] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: {
        promotion: true
      }
    }),
    prisma.promotion.findMany({ orderBy: { shortName: "asc" } })
  ]);

  return { event, promotions };
}

export async function getAdminTagEditorData(tagId: string) {
  return prisma.tag.findUnique({
    where: { id: tagId }
  });
}

export async function getSiteChromeData() {
  const [promotions, tags] = await Promise.all([
    prisma.promotion.findMany({ orderBy: { shortName: "asc" } }),
    prisma.tag.findMany({ orderBy: { label: "asc" } })
  ]);

  return { promotions, tags };
}

export async function getHomePageData() {
  const [articles, events, fighters] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      take: 3
    }),
    prisma.event.findMany({
      orderBy: [{ status: "asc" }, { date: "asc" }],
      include: {
        promotion: true,
        fights: {
          include: {
            fighterA: true,
            fighterB: true
          },
          take: 4,
          orderBy: { createdAt: "asc" }
        }
      },
      take: 3
    }),
    prisma.fighter.findMany({
      where: {
        AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }]
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        promotion: true,
        _count: {
          select: {
            recentFights: true
          }
        }
      },
      take: 4
    })
  ]);

  return { articles, events, fighters: dedupeFightersForPublicList(fighters).slice(0, 4) };
}

export async function getNewsPageData(filters: NewsPageFilters = {}) {
  const articleWhere: Prisma.ArticleWhereInput = {
    status: "published",
    category: "news",
    AND: [{ coverImageUrl: { not: null } }, { coverImageUrl: { not: "" } }],
    ...(filters.promotion ? { promotion: { slug: filters.promotion } } : {}),
    ...(filters.tag
      ? {
          tagMap: {
            some: {
              tag: {
                slug: filters.tag
              }
            }
          }
        }
      : {})
  };

  const [{ promotions, tags }, articles] = await Promise.all([
    getSiteChromeData(),
    prisma.article.findMany({
      where: articleWhere,
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      take: 100
    })
  ]);

  return {
    promotions,
    tags,
    articles,
    filters: {
      promotion: filters.promotion ?? "",
      tag: filters.tag ?? ""
    }
  };
}

export async function getEventsPageData(filters: EventsPageFilters = {}) {
  const validStatuses: EventStatus[] = ["upcoming", "live", "completed"];
  const normalizedStatus = validStatuses.includes(filters.status as EventStatus) ? (filters.status as EventStatus) : undefined;

  const [events, promotions] = await Promise.all([
    prisma.event.findMany({
      where: {
        ...(filters.promotion ? { promotion: { slug: filters.promotion } } : {}),
        ...(normalizedStatus ? { status: normalizedStatus } : {})
      },
      orderBy: [{ status: "asc" }, { date: "asc" }],
      include: {
        promotion: true,
        fights: {
          include: {
            fighterA: true,
            fighterB: true
          },
          take: 5,
          orderBy: { createdAt: "asc" }
        }
      },
      take: 100
    }),
    prisma.promotion.findMany({
      orderBy: { shortName: "asc" },
      select: { slug: true, shortName: true, name: true }
    })
  ]);

  return {
    events,
    filters: {
      promotion: filters.promotion ?? "",
      status: normalizedStatus ?? ""
    },
    options: {
      promotions,
      statuses: ["upcoming", "live", "completed"] as const
    }
  };
}

export async function getFightersPageData(filters: FightersPageFilters = {}) {
  const query = filters.query?.trim();
  const validStatuses: FighterStatus[] = ["active", "champion", "retired", "prospect"];
  const normalizedStatus = validStatuses.includes(filters.status as FighterStatus)
    ? (filters.status as FighterStatus)
    : undefined;
  const fightersWhere: Prisma.FighterWhereInput = {
    AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }],
    ...(query
      ? {
          OR: [{ name: { contains: query } }, { nameRu: { contains: query } }, { nickname: { contains: query } }]
        }
      : {}),
    ...(filters.promotion ? { promotion: { slug: filters.promotion } } : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(filters.weightClass ? { weightClass: filters.weightClass } : {})
  };

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
      },
      take: 500
    }),
    prisma.promotion.findMany({
      orderBy: { shortName: "asc" },
      select: { slug: true, shortName: true, name: true }
    }),
    prisma.fighter.findMany({
      distinct: ["weightClass"],
      orderBy: { weightClass: "asc" },
      select: { weightClass: true }
    })
  ]);

  return {
    fighters: dedupeFightersForPublicList(fighters),
    filters: {
      query: query ?? "",
      promotion: filters.promotion ?? "",
      status: filters.status ?? "",
      weightClass: filters.weightClass ?? ""
    },
    options: {
      promotions,
      weightClasses: weightClasses.map((item) => item.weightClass),
      statuses: ["active", "champion", "retired", "prospect"] as const
    }
  };
}

export async function getRankingsPageData() {
  return prisma.fighter.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      promotion: true
    }
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

export async function getPromotionRankingsPageData(filters: RankingsPageFilters = {}) {
  const promotions = await prisma.promotion.findMany({
    where: {
      slug: {
        in: ["ufc", "pfl"]
      }
    },
    orderBy: { shortName: "asc" },
    select: { slug: true, shortName: true, name: true }
  });

  const selectedPromotion =
    promotions.find((promotion) => promotion.slug === filters.promotion)?.slug ??
    promotions.find((promotion) => promotion.slug === "ufc")?.slug ??
    promotions[0]?.slug ??
    "";

  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: selectedPromotion },
      status: { in: ["active", "champion", "prospect"] }
    },
    include: {
      promotion: true
    }
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

export async function getAnalysisPageData() {
  return prisma.article.findMany({
    where: { category: "analysis", status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 50
  });
}

export async function getPredictionsPageData() {
  return prisma.event.findMany({
    where: {
      status: {
        in: ["upcoming", "live"]
      }
    },
    orderBy: [{ status: "asc" }, { date: "asc" }],
    include: {
      promotion: true,
      fights: {
        orderBy: { createdAt: "asc" },
        include: {
          fighterA: {
            include: {
              promotion: true
            }
          },
          fighterB: {
            include: {
              promotion: true
            }
          }
        }
      }
    }
  });
}

export const getQuotesPageData = cache(async function getQuotesPageData() {
  return prisma.article.findMany({
    where: {
      category: "interview",
      status: "published",
      AND: [{ coverImageUrl: { not: null } }, { coverImageUrl: { not: "" } }]
    },
    orderBy: { publishedAt: "desc" },
    take: 50
  });
});

export async function getPredictionEditorialPageData() {
  return prisma.article.findMany({
    where: {
      category: "analysis",
      status: "published",
      AND: [{ coverImageUrl: { not: null } }, { coverImageUrl: { not: "" } }]
    },
    orderBy: { publishedAt: "desc" },
    include: {
      promotion: true,
      tagMap: { include: { tag: true } }
    },
    take: 12
  });
}

export const getArticlePageData = cache(async function getArticlePageData(slug: string) {
  return prisma.article.findFirst({
    where: { slug, status: "published" },
    include: {
      promotion: true,
      event: true,
      sections: { orderBy: { sortOrder: "asc" } },
      tagMap: { include: { tag: true } },
      fighterMap: { include: { fighter: true } },
      sourceMap: { include: { source: true } }
    }
  });
});

export async function getAdminArticleEditorData(articleId: string) {
  const [options, article] = await Promise.all([
    getAdminEditorOptions(),
    prisma.article.findUnique({
      where: { id: articleId },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
        tagMap: true,
        fighterMap: true,
        sourceMap: true
      }
    })
  ]);

  return {
    ...options,
    article
  };
}

export const getEventPageData = cache(async function getEventPageData(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      promotion: true,
      fights: {
        include: {
          fighterA: true,
          fighterB: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!event) {
    return null;
  }

  const relatedArticles = await prisma.article.findMany({
    where: { eventId: event.id, status: "published" },
    orderBy: { publishedAt: "desc" }
  });

  return { event, relatedArticles };
});

export const getFightPredictionPageData = cache(async function getFightPredictionPageData(eventSlug: string, fightId: string) {
  const fight = await prisma.fight.findUnique({
    where: { id: fightId },
    include: {
      event: {
        include: {
          promotion: true
        }
      },
      fighterA: {
        include: {
          promotion: true,
          recentFights: {
            orderBy: { date: "desc" },
            take: 3
          }
        }
      },
      fighterB: {
        include: {
          promotion: true,
          recentFights: {
            orderBy: { date: "desc" },
            take: 3
          }
        }
      }
    }
  });

  if (!fight || fight.event.slug !== eventSlug) {
    return null;
  }

  const relatedArticles = await prisma.article.findMany({
    where: {
      status: "published",
      OR: [
        { eventId: fight.eventId },
        {
          fighterMap: {
            some: {
              fighterId: {
                in: [fight.fighterAId, fight.fighterBId]
              }
            }
          }
        }
      ]
    },
    orderBy: { publishedAt: "desc" },
    take: 4
  });

  const relatedPredictionArticles = await prisma.article.findMany({
    where: {
      status: "published",
      category: "analysis",
      OR: [
        { eventId: fight.eventId },
        {
          fighterMap: {
            some: {
              fighterId: {
                in: [fight.fighterAId, fight.fighterBId]
              }
            }
          }
        }
      ]
    },
    orderBy: { publishedAt: "desc" },
    take: 4
  });

  const fightPredictionArticle = await prisma.article.findFirst({
    where: {
      status: "published",
      category: "analysis",
      eventId: fight.eventId,
      AND: [
        {
          fighterMap: {
            some: { fighterId: fight.fighterAId }
          }
        },
        {
          fighterMap: {
            some: { fighterId: fight.fighterBId }
          }
        }
      ]
    },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: { publishedAt: "desc" }
  });

  return { fight, relatedArticles, relatedPredictionArticles, fightPredictionArticle };
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
      orderBy: { createdAt: "desc" }
    }),
    prisma.fighterRecentFight.findMany({
      where: { fighterId: fighter.id },
      orderBy: { date: "desc" },
    }),
    prisma.article.findMany({
      where: {
        status: "published",
        fighterMap: {
          some: { fighterId: fighter.id }
        }
      },
      orderBy: { publishedAt: "desc" }
    })
  ]);

  const normalizedFighterName = fighter.name.trim().toLowerCase();
  const normalizedFighterNameRu = fighter.nameRu?.trim().toLowerCase() ?? "";
  const visibleProfileRecentFights = profileRecentFights.filter((fight) => {
    const opponentName = fight.opponentName.trim().toLowerCase();
    const opponentNameRu = fight.opponentNameRu?.trim().toLowerCase() ?? "";

    if (opponentName === normalizedFighterName || (normalizedFighterNameRu && opponentNameRu === normalizedFighterNameRu)) {
      return false;
    }

    return true;
  });

  return { fighter, recentFights, profileRecentFights: visibleProfileRecentFights, relatedArticles };
});
