import { getArticleRouteBase } from "@/lib/article-routes";
import { getUfcRankingSnapshot } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { findRankingDivision } from "@/lib/ranking-divisions";
import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";

export type FreshPage = { path: string; lastModified: Date };

// Страницы, изменённые после `since`: статьи, турниры, прогнозы и рейтинг, плюс их
// разделы и главная. Общий источник для IndexNow (Яндекс) и /sitemap-fresh.xml (Google).
// Карточки бойцов сюда не входят: ежедневные синки трогают тысячи профилей.
// `includeUpcomingEvents` добавляет все ближайшие турниры независимо от правок:
// по «юфс N кард» страница должна быть в индексе за недели до даты, а не накануне.
export async function getFreshPages(since: Date, { includeUpcomingEvents = false } = {}): Promise<FreshPage[]> {
  const [articles, events, snapshots, rankingSnapshot] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published", updatedAt: { gt: since } },
      select: { slug: true, category: true, updatedAt: true }
    }),
    prisma.event.findMany({
      where: includeUpcomingEvents
        ? { OR: [{ updatedAt: { gt: since } }, { status: "upcoming" }] }
        : { updatedAt: { gt: since } },
      select: { slug: true, updatedAt: true }
    }),
    prisma.fightPredictionSnapshot.findMany({
      where: { updatedAt: { gt: since } },
      select: { updatedAt: true, fight: { select: { slug: true, event: { select: { slug: true } } } } }
    }),
    getUfcRankingSnapshot()
  ]);
  const pages = new Map<string, Date>();
  const add = (path: string, lastModified: Date) => {
    const current = pages.get(path);
    if (!current || current < lastModified) pages.set(path, lastModified);
  };

  for (const article of articles) {
    const base = getArticleRouteBase(article.category);
    add(`${base}/${article.slug}`, article.updatedAt);
    add(base, article.updatedAt);
  }
  for (const event of events) {
    add(`/events/${event.slug}`, event.updatedAt);
    add("/events", event.updatedAt);
  }
  for (const snapshot of snapshots) {
    if (snapshot.fight.slug && !isPlaceholderFightSlug(snapshot.fight.slug)) {
      add(`/predictions/${snapshot.fight.event.slug}/${snapshot.fight.slug}`, snapshot.updatedAt);
      add("/predictions", snapshot.updatedAt);
    }
  }
  if (rankingSnapshot && rankingSnapshot.fetchedAt > since) {
    add("/rankings", rankingSnapshot.fetchedAt);
    for (const group of rankingSnapshot.groups) {
      const division = findRankingDivision(group.title);
      if (division) add(`/rankings/${division.slug}`, rankingSnapshot.fetchedAt);
    }
  }
  if (pages.size > 0) {
    add("", new Date(Math.max(...[...pages.values()].map((date) => date.getTime()))));
  }

  return [...pages].map(([path, lastModified]) => ({ path, lastModified }));
}
