import type { MetadataRoute } from "next";

import { getArticleRouteBase } from "@/lib/article-routes";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

const staticRoutes = [
  "",
  "/news",
  "/analysis",
  "/events",
  "/fighters",
  "/rankings",
  "/predictions",
  "/quotes",
  "/videos",
  "/about",
  "/disclaimer",
  "/editorial-policy",
  "/sources-policy",
  "/privacy-policy",
  "/terms"
];

function hasUsablePhotoUrl(value: string | null | undefined) {
  const url = String(value || "").trim();
  if (!url) {
    return false;
  }

  return !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(url);
}

function looksLikeLowQualitySlug(value: string) {
  return /-\d+$|i-am-still-here|wants-this|journey-continues|ufc-|vegas|edmonton|mexico-city/i.test(value);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const [articles, events, fighters, predictionSnapshots] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: "published"
      },
      select: {
        slug: true,
        category: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 500
    }),
    prisma.event.findMany({
      select: {
        slug: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 500
    }),
    prisma.fighter.findMany({
      where: {
        promotion: {
          slug: {
            in: ["ufc"]
          }
        },
        status: {
          in: ["active", "champion", "prospect"]
        },
        photoUrl: {
          not: null
        }
      },
      select: {
        slug: true,
        photoUrl: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 2000
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
      },
      take: 1000
    })
  ]);
  const fighterEntries = fighters.filter(
    (fighter) => hasUsablePhotoUrl(fighter.photoUrl) && !looksLikeLowQualitySlug(fighter.slug)
  );
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: path === "" ? `${siteUrl}/ru` : `${siteUrl}/ru${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7
  }));

  return [
    ...staticEntries,
    ...articles.map((article) => ({
      url: `${siteUrl}/ru${getArticleRouteBase(article.category)}/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.9
    })),
    ...events.map((event) => ({
      url: `${siteUrl}/ru/events/${event.slug}`,
      lastModified: event.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...predictionSnapshots.filter((s) => s.fight.slug).map((snapshot) => ({
      url: `${siteUrl}/ru/predictions/${snapshot.fight.event.slug}/${snapshot.fight.slug}`,
      lastModified: snapshot.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.85
    })),
    ...fighterEntries.map((fighter) => ({
      url: `${siteUrl}/ru/fighters/${fighter.slug}`,
      lastModified: fighter.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    }))
  ];
}
