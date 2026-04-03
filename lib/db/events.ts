import type { EventStatus } from "@prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

type EventsPageFilters = {
  promotion?: string;
  status?: string;
};

export async function getEventsPageData(filters: EventsPageFilters = {}) {
  const validStatuses: EventStatus[] = ["upcoming", "live", "completed"];
  const normalizedStatus = validStatuses.includes(filters.status as EventStatus) ? (filters.status as EventStatus) : undefined;
  const promotionSlug = filters.promotion === "ufc" ? "ufc" : "ufc";

  const [events, promotions] = await Promise.all([
    prisma.event.findMany({
      where: {
        promotion: { slug: promotionSlug },
        ...(normalizedStatus ? { status: normalizedStatus } : {})
      },
      orderBy: [{ status: "asc" }, { date: "asc" }],
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
      take: 100
    }),
    prisma.promotion.findMany({
      where: {
        slug: "ufc"
      },
      orderBy: { shortName: "asc" },
      select: { slug: true, shortName: true, name: true }
    })
  ]);

  return {
    events,
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
    where: { eventId: event.id, status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 30
  });

  return { event, relatedArticles };
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

export const getFightPredictionPageData = cache(async function getFightPredictionPageData(eventSlug: string, fightId: string) {
  const fight = await prisma.fight.findUnique({
    where: { id: fightId },
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

  return {
    fight,
    snapshot: fight.predictionSnapshot,
    relatedArticles,
    relatedPredictionArticles,
    fightPredictionArticle
  };
});
