import type { ArticleStatus } from "@prisma/client";

import { getOperationalAlerts } from "@/lib/operational-monitoring";
import { prisma } from "@/lib/prisma";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "./articles";
import { dedupeFightersForPublicList } from "./fighters";

type AdminModerationSort = "newest" | "aiDesc" | "aiAsc";

type AdminDashboardFilters = {
  status?: ArticleStatus;
  aiOnly?: boolean;
  minConfidence?: number;
  sort?: AdminModerationSort;
};

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
    browserPushSubscriptions,
    adminLoginAudits,
    systemEvents,
    operationalAlerts,
    backgroundJobs,
    ingestionRuns,
    articleCount,
    eventCount,
    fighterCount,
    sourceCount,
    browserPushSubscriptionCount,
    activeBrowserPushSubscriptionCount,
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
    prisma.browserPushSubscription.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 20
    }),
    prisma.adminLoginAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.systemEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    getOperationalAlerts(8),
    prisma.backgroundJob.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 20
    }),
    prisma.ingestionRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 6
    }),
    prisma.article.count(),
    prisma.event.count(),
    prisma.fighter.count(),
    prisma.source.count(),
    prisma.browserPushSubscription.count(),
    prisma.browserPushSubscription.count({ where: { isActive: true } }),
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
      browserPushSubscriptions: browserPushSubscriptionCount,
      activeBrowserPushSubscriptions: activeBrowserPushSubscriptionCount,
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
    browserPushSubscriptions,
    adminLoginAudits,
    systemEvents,
    operationalAlerts,
    backgroundJobs,
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

export async function getHomePageData() {
  const [articles, leadArticle, events, totalArticles, totalEvents, totalFighters] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published", category: "news", ...buildPublicArticleImageWhere() },
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      take: 12
    }),
    prisma.article.findFirst({
      where: {
        status: "published",
        ...buildPublicArticleImageWhere()
      },
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      }
    }),
    prisma.event.findMany({
      where: {
        status: { in: ["upcoming", "live"] },
        fights: { some: {} }
      },
      orderBy: [{ date: "asc" }],
      include: {
        promotion: true,
        fights: {
          include: {
            fighterA: true,
            fighterB: true,
            predictionSnapshot: true
          },
          take: 4,
          orderBy: { createdAt: "asc" }
        }
      },
      take: 3
    }),
    prisma.article.count({ where: { status: "published" } }),
    prisma.event.count(),
    prisma.fighter.count()
  ]);
  const visibleArticles = articles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)).slice(0, 3);
  const visibleLeadArticle = leadArticle && hasRenderablePublicArticleImage(leadArticle.coverImageUrl) ? leadArticle : null;

  const leadEvent = events[0];
  const eventFighterIds = new Set<string>();

  if (leadEvent) {
    for (const fight of leadEvent.fights) {
      eventFighterIds.add(fight.fighterAId);
      eventFighterIds.add(fight.fighterBId);
    }
  }

  const fighters = eventFighterIds.size > 0
    ? await prisma.fighter.findMany({
        where: {
          id: { in: [...eventFighterIds] },
          AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }]
        },
        include: {
          promotion: true,
          _count: { select: { recentFights: true } }
        }
      })
    : await prisma.fighter.findMany({
        where: {
          status: { in: ["champion", "active"] },
          AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }]
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          promotion: true,
          _count: { select: { recentFights: true } }
        },
        take: 8
      });

  return {
    articles: visibleArticles,
    leadArticle: visibleLeadArticle,
    events,
    fighters: dedupeFightersForPublicList(fighters).slice(0, 4),
    totalArticles,
    totalEvents,
    totalFighters
  };
}
