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

// Редактор может перенести материал из новостей в разборы — тогда старый адрес
// перестаёт существовать. Возвращаем актуальный путь, чтобы отдать 308 вместо
// 404: внешние ссылки и позиции в выдаче переезжают на новый адрес.
export function resolveMovedArticlePath(
  requestedCategory: ArticleCategory,
  actualCategory: ArticleCategory,
  slug: string
) {
  if (getArticleRouteBase(requestedCategory) === getArticleRouteBase(actualCategory)) {
    return null;
  }

  return getArticleHref(actualCategory, slug);
}
