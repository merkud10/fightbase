import type { Prisma } from "@prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getSiteChromeData } from "./admin";

type NewsPageFilters = {
  promotion?: string;
  tag?: string;
};

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

export async function getAnalysisPageData() {
  return prisma.article.findMany({
    where: { category: "analysis", status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 50
  });
}

export const getQuotesPageData = cache(async function getQuotesPageData() {
  return prisma.article.findMany({
    where: {
      category: "interview",
      status: "published",
      promotion: { slug: "ufc" },
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
