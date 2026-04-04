import type { ArticleCategory } from "@prisma/client";

export function getArticleRouteBase(category: ArticleCategory) {
  switch (category) {
    case "analysis":
      return "/analysis";
    case "interview":
      return "/quotes";
    default:
      return "/news";
  }
}

export function getArticleHref(category: ArticleCategory, slug: string) {
  return `${getArticleRouteBase(category)}/${slug}`;
}
