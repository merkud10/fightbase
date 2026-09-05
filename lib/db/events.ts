import type { EventStatus } from "@prisma/client";
import { cache } from "react";

import { eventNightWindowBounds } from "@/lib/event-night";
import { sortFightsForCard } from "@/lib/fight-card";
import { addToRoiBucket, emptyRoiBucket, resolvePickRoiUnits, roiPercent } from "@/lib/prediction-roi";
import { resolveAiPickVerdict, resolvePredictionVerdict } from "@/lib/prediction-verdict";
import { predictionStatsDateFilter } from "@/lib/prediction-stats-window";
import { prisma } from "@/lib/prisma";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "./articles";

type EventsPageFilters = {
  promotion?: string;
  status?: string;
  page?: number;
  perPage?: number;
};

const EVENTS_PER_PAGE = 12;

export const getEventsPageData = cache(async function getEventsPageData(filters: EventsPageFilters = {}) {
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
          }
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
  const orderedEvents = events.map((event) => ({
    ...event,
    fights: sortFightsForCard(event.fights).slice(0, 5)
  }));

  return {
    events: orderedEvents,
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
});

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
        }
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
    event: {
      ...event,
      fights: sortFightsForCard(event.fights)
    },
    relatedArticles: relatedArticles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)).slice(0, 30)
  };
});

export async function getPredictionsPageData() {
  const events = await prisma.event.findMany({
    where: {
      status: {
        in: ["upcoming", "live"]
      }
    },
    orderBy: [{ status: "asc" }, { date: "asc" }],
    include: {
      promotion: true,
      fights: {
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

  return events.map((event) => ({
    ...event,
    fights: sortFightsForCard(event.fights)
  }));
}

// Сводка точности по завершённым боям со снапшотами: пик = боец с большим
// процентом, судим только чистые победы (win + winnerFighterId).
export const getPredictionAccuracy = cache(async function getPredictionAccuracy(lastEvents = 5) {
  const completedEvents = await prisma.event.findMany({
    where: {
      status: "completed",
      date: predictionStatsDateFilter(),
      fights: {
        some: {
          status: "completed",
          predictionSnapshot: { isNot: null }
        }
      }
    },
    orderBy: { date: "desc" },
    take: lastEvents,
    select: {
      id: true,
      fights: {
        where: {
          status: "completed",
          predictionSnapshot: { isNot: null }
        },
        select: {
          fighterAId: true,
          fighterBId: true,
          winnerFighterId: true,
          resultType: true,
          status: true,
          predictionSnapshot: {
            select: { percentA: true, percentB: true, aiPickFighterId: true, oddsAAtPick: true, oddsBAtPick: true }
          }
        }
      }
    }
  });

  const favorite = { correct: 0, judged: 0 };
  const model = { correct: 0, judged: 0 };
  const favoriteRoi = emptyRoiBucket();
  const modelRoi = emptyRoiBucket();

  for (const event of completedEvents) {
    for (const fight of event.fights) {
      const snapshot = fight.predictionSnapshot;
      if (!snapshot || !fight.fighterAId || !fight.fighterBId) {
        continue;
      }

      const favoriteVerdict = resolvePredictionVerdict({
        percentA: snapshot.percentA,
        percentB: snapshot.percentB,
        fighterAId: fight.fighterAId,
        fighterBId: fight.fighterBId,
        status: fight.status,
        resultType: fight.resultType,
        winnerFighterId: fight.winnerFighterId
      });
      if (favoriteVerdict === "correct") {
        favorite.correct += 1;
        favorite.judged += 1;
      } else if (favoriteVerdict === "wrong") {
        favorite.judged += 1;
      }

      const modelVerdict = resolveAiPickVerdict({
        aiPickFighterId: snapshot.aiPickFighterId,
        status: fight.status,
        resultType: fight.resultType,
        winnerFighterId: fight.winnerFighterId
      });
      if (modelVerdict === "correct") {
        model.correct += 1;
        model.judged += 1;
      } else if (modelVerdict === "wrong") {
        model.judged += 1;
      }

      const pickOdds =
        snapshot.aiPickFighterId === fight.fighterAId
          ? snapshot.oddsAAtPick
          : snapshot.aiPickFighterId === fight.fighterBId
            ? snapshot.oddsBAtPick
            : null;
      addToRoiBucket(modelRoi, resolvePickRoiUnits(modelVerdict, pickOdds));

      const favoriteOdds =
        snapshot.percentA === snapshot.percentB
          ? null
          : snapshot.percentA > snapshot.percentB
            ? snapshot.oddsAAtPick
            : snapshot.oddsBAtPick;
      addToRoiBucket(favoriteRoi, resolvePickRoiUnits(favoriteVerdict, favoriteOdds));
    }
  }

  const withPercent = (bucket: { correct: number; judged: number }) => ({
    ...bucket,
    percent: bucket.judged > 0 ? Math.round((bucket.correct / bucket.judged) * 100) : null
  });

  return {
    eventsCount: completedEvents.length,
    favorite: withPercent(favorite),
    model: withPercent(model),
    modelRoi: { ...modelRoi, percent: roiPercent(modelRoi) },
    favoriteRoi: { ...favoriteRoi, percent: roiPercent(favoriteRoi) }
  };
});

// Событие «турнирной ночи» для live-баннера на главной: окно то же, что у
// event-night workflow, поэтому баннер живёт ровно пока идут синк и ревалидация.
export const getEventNightEvent = cache(async function getEventNightEvent() {
  const { minDate, maxDate } = eventNightWindowBounds(new Date());

  return prisma.event.findFirst({
    where: {
      status: { in: ["upcoming", "live"] },
      date: { gte: minDate, lte: maxDate }
    },
    orderBy: { date: "asc" },
    select: {
      slug: true,
      name: true,
      date: true,
      mainCardAt: true
    }
  });
});

export const getPredictionAccuracyHistory = cache(async function getPredictionAccuracyHistory() {
  const completedEvents = await prisma.event.findMany({
    where: {
      status: "completed",
      date: predictionStatsDateFilter(),
      fights: {
        some: {
          status: "completed",
          predictionSnapshot: { isNot: null }
        }
      }
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      date: true,
      fights: {
        where: {
          status: "completed",
          predictionSnapshot: { isNot: null }
        },
        select: {
          id: true,
          slug: true,
          stage: true,
          boutOrder: true,
          isMainEvent: true,
          createdAt: true,
          fighterAId: true,
          fighterBId: true,
          winnerFighterId: true,
          resultType: true,
          status: true,
          fighterA: { select: { id: true, name: true, nameRu: true } },
          fighterB: { select: { id: true, name: true, nameRu: true } },
          predictionSnapshot: {
            select: { percentA: true, percentB: true, aiPickFighterId: true, oddsAAtPick: true, oddsBAtPick: true }
          }
        }
      }
    }
  });

  return completedEvents
    .map((event) => {
      const favorite = { correct: 0, judged: 0 };
      const model = { correct: 0, judged: 0 };
      const favoriteRoi = emptyRoiBucket();
      const modelRoi = emptyRoiBucket();

      const fights = sortFightsForCard(event.fights)
        .map((fight) => {
          const snapshot = fight.predictionSnapshot;
          if (!snapshot || !fight.fighterAId || !fight.fighterBId) {
            return null;
          }

          const favoriteVerdict = resolvePredictionVerdict({
            percentA: snapshot.percentA,
            percentB: snapshot.percentB,
            fighterAId: fight.fighterAId,
            fighterBId: fight.fighterBId,
            status: fight.status,
            resultType: fight.resultType,
            winnerFighterId: fight.winnerFighterId
          });
          if (favoriteVerdict === "correct") {
            favorite.correct += 1;
            favorite.judged += 1;
          } else if (favoriteVerdict === "wrong") {
            favorite.judged += 1;
          }

          const modelVerdict = resolveAiPickVerdict({
            aiPickFighterId: snapshot.aiPickFighterId,
            status: fight.status,
            resultType: fight.resultType,
            winnerFighterId: fight.winnerFighterId
          });
          if (modelVerdict === "correct") {
            model.correct += 1;
            model.judged += 1;
          } else if (modelVerdict === "wrong") {
            model.judged += 1;
          }

          const favoriteFighterId =
            snapshot.percentA === snapshot.percentB
              ? null
              : snapshot.percentA > snapshot.percentB
                ? fight.fighterAId
                : fight.fighterBId;
          const pickFighter =
            snapshot.aiPickFighterId === fight.fighterAId
              ? fight.fighterA
              : snapshot.aiPickFighterId === fight.fighterBId
                ? fight.fighterB
                : null;
          const winnerFighter =
            fight.winnerFighterId === fight.fighterAId
              ? fight.fighterA
              : fight.winnerFighterId === fight.fighterBId
                ? fight.fighterB
                : null;

          const pickOdds =
            snapshot.aiPickFighterId === fight.fighterAId
              ? snapshot.oddsAAtPick
              : snapshot.aiPickFighterId === fight.fighterBId
                ? snapshot.oddsBAtPick
                : null;
          const pickUnits = resolvePickRoiUnits(modelVerdict, pickOdds);
          addToRoiBucket(modelRoi, pickUnits);

          const favoriteOdds =
            favoriteFighterId === fight.fighterAId
              ? snapshot.oddsAAtPick
              : favoriteFighterId === fight.fighterBId
                ? snapshot.oddsBAtPick
                : null;
          addToRoiBucket(favoriteRoi, resolvePickRoiUnits(favoriteVerdict, favoriteOdds));

          return {
            id: fight.id,
            slug: fight.slug,
            fighterA: fight.fighterA,
            fighterB: fight.fighterB,
            percentA: snapshot.percentA,
            percentB: snapshot.percentB,
            pickFighter,
            pickAgainstOdds: Boolean(
              snapshot.aiPickFighterId && favoriteFighterId && snapshot.aiPickFighterId !== favoriteFighterId
            ),
            pickOdds,
            pickUnits,
            winnerFighter,
            resultType: fight.resultType,
            favoriteVerdict,
            modelVerdict
          };
        })
        .filter((fight): fight is NonNullable<typeof fight> => fight !== null);

      return {
        id: event.id,
        slug: event.slug,
        name: event.name,
        date: event.date,
        fights,
        favorite,
        model,
        modelRoi: { ...modelRoi, percent: roiPercent(modelRoi) },
        favoriteRoi: { ...favoriteRoi, percent: roiPercent(favoriteRoi) }
      };
    })
    .filter((event) => event.fights.length > 0);
});

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

// Прогноз живёт только пока у боя есть снимок: после турнира снимок удаляется, и
// страница пропадает. Отдавать 404 по адресу, который был в выдаче, дорого —
// сам бой остаётся описан на странице события, туда и уводим. Проверяем, что бой
// действительно принадлежит этому событию, иначе опечатка в URL получила бы
// редирект вместо честного 404.
export const getPredictionFallbackEventSlug = cache(async function getPredictionFallbackEventSlug(
  eventSlug: string,
  fightSlug: string
) {
  const fight = await prisma.fight.findUnique({
    where: { slug: fightSlug },
    select: { event: { select: { slug: true } } }
  });

  return fight?.event.slug === eventSlug ? eventSlug : null;
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
