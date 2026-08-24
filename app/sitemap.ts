import type { MetadataRoute } from "next";

import { getArticleRouteBase } from "@/lib/article-routes";
import { isIndexableComparisonPair } from "@/lib/compare-curation";
import { getQuotesPageData } from "@/lib/db";
import { getCuratedComparisonPairs } from "@/lib/db/comparison";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import {
  getArticleFreshness,
  getFighterPriority,
  isPlaceholderFightSlug,
  looksLikeLowQualitySlug
} from "@/lib/sitemap-entries";

const staticRoutes = [
  "",
  "/news",
  "/analysis",
  "/events",
  "/fighters",
  "/rankings",
  "/compare",
  "/predictions",
  "/quotes",
  "/about",
  "/disclaimer",
  "/editorial-policy",
  "/sources-policy",
  "/privacy-policy",
  "/terms"
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const now = Date.now();
  const [articles, events, fighters, predictionSnapshots, quotes, comparisonPairs] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: "published"
      },
      select: {
        slug: true,
        category: true,
        publishedAt: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.event.findMany({
      select: {
        slug: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.fighter.findMany({
      where: {
        promotion: {
          slug: {
            in: ["ufc"]
          }
        }
      },
      select: {
        slug: true,
        status: true,
        photoUrl: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.fightPredictionSnapshot.findMany({
      select: {
        updatedAt: true,
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
      orderBy: {
        updatedAt: "desc"
      }
    }),
    getQuotesPageData(),
    getCuratedComparisonPairs()
  ]);
  const fighterEntries = fighters.filter((fighter) => !looksLikeLowQualitySlug(fighter.slug));
  const staticEntries: MetadataRoute.Sitemap = staticRoutes
    .filter((path) => path !== "/quotes" || quotes.totalCount > 0)
    .map((path) => ({
      url: path === "" ? `${siteUrl}/ru` : `${siteUrl}/ru${path}`,
      changeFrequency: path === "" ? "daily" : "weekly",
      priority: path === "" ? 1 : 0.7
    }));

  return [
    ...staticEntries,
    ...articles.map((article) => ({
      url: `${siteUrl}/ru${getArticleRouteBase(article.category)}/${article.slug}`,
      lastModified: article.updatedAt,
      ...getArticleFreshness(article.publishedAt, now)
    })),
    ...events.map((event) => ({
      url: `${siteUrl}/ru/events/${event.slug}`,
      lastModified: event.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...predictionSnapshots
      .filter((snapshot) => snapshot.fight.slug && !isPlaceholderFightSlug(snapshot.fight.slug))
      .map((snapshot) => ({
        url: `${siteUrl}/ru/predictions/${snapshot.fight.event.slug}/${snapshot.fight.slug}`,
        lastModified: snapshot.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.85
      })),
    ...comparisonPairs.filter(isIndexableComparisonPair).map((pair) => ({
      url: `${siteUrl}/ru/compare/${pair.pairSlug}`,
      changeFrequency: pair.isScheduled ? ("weekly" as const) : ("monthly" as const),
      priority: 0.6
    })),
    ...fighterEntries.map((fighter) => ({
      url: `${siteUrl}/ru/fighters/${fighter.slug}`,
      lastModified: fighter.updatedAt,
      changeFrequency: fighter.status === "retired" ? ("monthly" as const) : ("weekly" as const),
      priority: getFighterPriority(fighter.status, fighter.photoUrl)
    }))
  ];
}
