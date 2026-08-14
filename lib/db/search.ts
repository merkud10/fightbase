import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "./articles";

export const searchSite = cache(async function searchSite(query: string) {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return { query: normalized, articles: [], fighters: [], events: [] };
  }

  const [articles, fighters, events] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: "published",
        ...buildPublicArticleImageWhere(),
        OR: [
          { title: { contains: normalized, mode: "insensitive" } },
          { excerpt: { contains: normalized, mode: "insensitive" } }
        ]
      },
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      take: 12
    }),
    prisma.fighter.findMany({
      where: {
        OR: [
          { name: { contains: normalized, mode: "insensitive" } },
          { nameRu: { contains: normalized, mode: "insensitive" } },
          { nickname: { contains: normalized, mode: "insensitive" } }
        ]
      },
      include: { promotion: true },
      orderBy: { name: "asc" },
      take: 8
    }),
    prisma.event.findMany({
      where: { name: { contains: normalized, mode: "insensitive" } },
      include: { promotion: true },
      orderBy: { date: "desc" },
      take: 6
    })
  ]);

  return {
    query: normalized,
    articles: articles.filter((article) => hasRenderablePublicArticleImage(article.coverImageUrl)),
    fighters,
    events
  };
});
