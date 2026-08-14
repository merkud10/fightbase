import type { Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { cache } from "react";

import { resolveAppRoot } from "@/lib/paths";
import { prisma } from "@/lib/prisma";
import { recordSystemEvent } from "@/lib/system-events";
import { getSiteChromeData } from "./admin";

type NewsPageFilters = {
  promotion?: string;
  tag?: string;
  page?: number;
  perPage?: number;
};

const NEWS_PER_PAGE = 12;

function resolvePublicImagePath(imageUrl: string) {
  const normalized = String(imageUrl || "").trim();

  if (!normalized.startsWith("/")) {
    return null;
  }

  return path.join(resolveAppRoot(), "public", normalized.replace(/^\/+/, "").replace(/\//g, path.sep));
}

export function hasRenderablePublicArticleImage(imageUrl: string | null | undefined) {
  const normalized = String(imageUrl || "").trim();

  if (!normalized) {
    return false;
  }

  if (!(normalized.startsWith("/media/articles/") || normalized === "/logo.png")) {
    return false;
  }

  const filePath = resolvePublicImagePath(normalized);
  return Boolean(filePath && fs.existsSync(filePath));
}

function filterArticlesWithRenderableImages<
  T extends { id?: string; slug?: string; coverImageUrl: string | null }
>(articles: T[]) {
  const visible: T[] = [];
  const hidden: Array<{ id?: string; slug?: string; coverImageUrl: string | null }> = [];

  for (const article of articles) {
    if (hasRenderablePublicArticleImage(article.coverImageUrl)) {
      visible.push(article);
    } else {
      hidden.push({ id: article.id, slug: article.slug, coverImageUrl: article.coverImageUrl });
    }
  }

  if (hidden.length > 0) {
    void recordSystemEvent({
      level: "warn",
      category: "article.renderable-filter",
      message: `Filtered ${hidden.length} published article(s) without on-disk cover image`,
      source: "lib/db/articles",
      meta: { hidden: hidden.slice(0, 20) }
    });
  }

  return visible;
}

export function buildPublicArticleImageWhere(): Prisma.ArticleWhereInput {
  return {
    AND: [
      { coverImageUrl: { not: null } },
      { coverImageUrl: { not: "" } },
      {
        OR: [{ coverImageUrl: { startsWith: "/media/articles/" } }, { coverImageUrl: "/logo.png" }]
      }
    ]
  };
}

export const getNewsPageData = cache(async function getNewsPageData(filters: NewsPageFilters = {}) {
  const perPage = filters.perPage ?? NEWS_PER_PAGE;
  const page = Math.max(1, filters.page ?? 1);
  const articleWhere: Prisma.ArticleWhereInput = {
    status: "published",
    category: "news",
    ...buildPublicArticleImageWhere(),
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

  const [{ promotions, tags }, totalCount, articles] = await Promise.all([
    getSiteChromeData(),
    prisma.article.count({ where: articleWhere }),
    prisma.article.findMany({
      where: articleWhere,
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      skip: (Math.max(1, page) - 1) * perPage,
      take: perPage
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(page, totalPages);

  return {
    promotions,
    tags,
    articles: filterArticlesWithRenderableImages(articles),
    totalCount,
    page: safePage,
    totalPages,
    filters: {
      promotion: filters.promotion ?? "",
      tag: filters.tag ?? ""
    }
  };
});

const ARCHIVE_PER_PAGE = 12;

async function getPagedArticles(where: Prisma.ArticleWhereInput, page: number, perPage = ARCHIVE_PER_PAGE) {
  const requestedPage = Math.max(1, page);
  const [totalCount, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: {
        promotion: true,
        tagMap: { include: { tag: true } }
      },
      skip: (requestedPage - 1) * perPage,
      take: perPage
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return {
    articles: filterArticlesWithRenderableImages(articles),
    totalCount,
    page: Math.min(requestedPage, totalPages),
    totalPages
  };
}

export const getAnalysisPageData = cache(async function getAnalysisPageData(page = 1) {
  return getPagedArticles({ category: "analysis", status: "published", ...buildPublicArticleImageWhere() }, page);
});

export const getQuotesPageData = cache(async function getQuotesPageData(page = 1) {
  return getPagedArticles(
    {
      category: "interview",
      status: "published",
      promotion: { slug: "ufc" },
      ...buildPublicArticleImageWhere()
    },
    page
  );
});

export async function getPredictionEditorialPageData() {
  const articles = await prisma.article.findMany({
    where: {
      category: "analysis",
      status: "published",
      ...buildPublicArticleImageWhere()
    },
    orderBy: { publishedAt: "desc" },
    include: {
      promotion: true,
      tagMap: { include: { tag: true } }
    },
    take: 12
  });

  return filterArticlesWithRenderableImages(articles);
}

export const getArticlePageData = cache(async function getArticlePageData(
  slug: string,
  category?: "news" | "analysis" | "interview"
) {
  const article = await prisma.article.findFirst({
    where: { slug, status: "published", ...(category ? { category } : {}), ...buildPublicArticleImageWhere() },
    include: {
      promotion: true,
      event: true,
      sections: { orderBy: { sortOrder: "asc" } },
      tagMap: { include: { tag: true } },
      fighterMap: { include: { fighter: true } },
      sourceMap: { include: { source: true } }
    }
  });

  if (!article || !hasRenderablePublicArticleImage(article.coverImageUrl)) {
    return null;
  }

  return article;
});

const relatedArticleSelect = {
  id: true,
  slug: true,
  title: true,
  coverImageUrl: true,
  coverImageAlt: true,
  excerpt: true,
  publishedAt: true,
  category: true,
  promotion: { select: { shortName: true } },
  tagMap: { select: { tag: { select: { id: true, label: true, slug: true } } } }
} satisfies Prisma.ArticleSelect;

export async function getRelatedArticles(input: {
  articleId: string;
  category: "news" | "analysis" | "interview";
  eventId?: string | null;
  fighterIds?: string[];
  take?: number;
}) {
  const take = input.take ?? 4;
  const fighterIds = input.fighterIds ?? [];
  const baseWhere: Prisma.ArticleWhereInput = {
    status: "published",
    id: { not: input.articleId },
    ...buildPublicArticleImageWhere()
  };

  const linkedFilters: Prisma.ArticleWhereInput[] = [
    ...(input.eventId ? [{ eventId: input.eventId }] : []),
    ...(fighterIds.length > 0 ? [{ fighterMap: { some: { fighterId: { in: fighterIds } } } }] : [])
  ];

  const linked =
    linkedFilters.length > 0
      ? await prisma.article.findMany({
          where: { ...baseWhere, OR: linkedFilters },
          orderBy: { publishedAt: "desc" },
          take,
          select: relatedArticleSelect
        })
      : [];

  if (linked.length >= take) {
    return filterArticlesWithRenderableImages(linked);
  }

  const fill = await prisma.article.findMany({
    where: {
      ...baseWhere,
      category: input.category,
      id: { notIn: [input.articleId, ...linked.map((article) => article.id)] }
    },
    orderBy: { publishedAt: "desc" },
    take: take - linked.length,
    select: relatedArticleSelect
  });

  return filterArticlesWithRenderableImages([...linked, ...fill]);
}
