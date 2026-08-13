import { getArticleHref } from "@/lib/article-routes";
import { buildPublicArticleImageWhere } from "@/lib/db";
import { localizePath } from "@/lib/locale-path";
import { prisma } from "@/lib/prisma";
import { buildRssXml } from "@/lib/rss";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 900;

const CATEGORY_LABEL_RU: Record<string, string> = {
  news: "Новости",
  analysis: "Аналитика",
  interview: "Интервью"
};

export async function GET() {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      category: { in: ["news", "analysis", "interview"] },
      ...buildPublicArticleImageWhere()
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      category: true,
      publishedAt: true
    }
  });

  const xml = buildRssXml(
    {
      title: "FightBase Media — новости UFC",
      link: `${siteUrl}/ru`,
      description: "Новости UFC, аналитика, прогнозы и интервью от FightBase Media.",
      language: "ru",
      selfUrl: `${siteUrl}/rss.xml`
    },
    articles.map((article) => ({
      title: article.title,
      link: `${siteUrl}${localizePath(getArticleHref(article.category, article.slug), "ru")}`,
      description: article.excerpt,
      pubDate: article.publishedAt ?? new Date(),
      category: CATEGORY_LABEL_RU[article.category] ?? null
    }))
  );

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8"
    }
  });
}
