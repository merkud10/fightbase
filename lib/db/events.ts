import type { EventStatus } from "@prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "./articles";

type EventsPageFilters = {
  promotion?: string;
  status?: string;
  page?: number;
  perPage?: number;
};

const EVENTS_PER_PAGE = 12;

export async function getEventsPageData(filters: EventsPageFilters = {}) {
  const validStatuses: EventStatus[] = ["upcoming", "live", "completed"];
  const normalizedStatus = validStatuses.includes(filters.status as EventStatus) ? (filters.status as EventStatus) : undefined;
  const promotionSlug = "ufc";
  const perPage = filters.perPage ?? EVENTS_PER_PAGE;
  const page = Math.max(1, filters.page ?? 1);

  const eventWhere = {
    promotion: { slug: promotionSlug },
    ...(normalizedStatus ? { status: normalizedStatus } : {})
  };

  const [totalCount, events, promotions] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.event.findMany({
      where: eventWhere,
      orderBy: [{ status: "asc" }, { date: normalizedStatus === "completed" ? "desc" : "asc" }],
      include: {
        promotion: true,
        fights: {
          include: {
            fighterA: true,
            fighterB: true,
            predictionSnapshot: true
          },
          take: 5,
          orderBy: { createdAt: "asc" }
        }
      },
      skip: (page - 1) * perPage,
      take: perPage
    }),
    prisma.promotion.findMany({
      where: {
        slug: "ufc"
      },
      orderBy: { shortName: "asc" },
      select: { slug: true, shortName: true, name: true }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return {
    events,
    totalCount,
    page: Math.min(page, totalPages),
    totalPages,
    filters: {
      promotion: promotionSlug,
      status: normalizedStatus ?? ""
    },
    options: {
      promotions,
      statuses: ["upcoming", "live", "completed"] as const
    }
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
          fighterB: true,
          predictionSnapshot: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!event) {
    return null;
  }

  const relatedArticles = await prisma.article.findMany({
    where: { eventId: event.id, status: "published", ...buildPublicArticleImageWhere() },
    orderBy: { publishedAt: "desc" },
    take: 60
  });

  return {
    event,
    relatedArticles: relatedArticles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)).slice(0, 30)
  };
});

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
          predictionSnapshot: true,
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

export const getPredictionPageParams = cache(async function getPredictionPageParams() {
  return prisma.fightPredictionSnapshot.findMany({
    select: {
      fightId: true,
      fight: {
        select: {
          slug: true,
          event: {
            select: {
              slug: true
            }
          }
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });
});

export const getFightPredictionPageData = cache(async function getFightPredictionPageData(eventSlug: string, fightSlug: string) {
  const fight = await prisma.fight.findUnique({
    where: { slug: fightSlug },
    include: {
      predictionSnapshot: true,
      event: {
        include: {
          promotion: true
        }
      },
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
  });

  if (!fight || fight.event.slug !== eventSlug || !fight.predictionSnapshot) {
    return null;
  }

  const relatedArticles = await prisma.article.findMany({
    where: {
      status: "published",
      ...buildPublicArticleImageWhere(),
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
    take: 12
  });

  const relatedPredictionArticles = await prisma.article.findMany({
    where: {
      status: "published",
      category: "analysis",
      ...buildPublicArticleImageWhere(),
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
    take: 12
  });

  const fightPredictionArticle = await prisma.article.findFirst({
    where: {
      status: "published",
      category: "analysis",
      eventId: fight.eventId,
      ...buildPublicArticleImageWhere(),
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

  return {
    fight,
    snapshot: fight.predictionSnapshot,
    relatedArticles: relatedArticles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)).slice(0, 4),
    relatedPredictionArticles: relatedPredictionArticles
      .filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl))
      .slice(0, 4),
    fightPredictionArticle
  };
});
