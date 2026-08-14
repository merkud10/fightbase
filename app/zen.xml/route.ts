import { getArticleHref } from "@/lib/article-routes";
import { buildPublicArticleImageWhere } from "@/lib/db";
import { localizePath } from "@/lib/locale-path";
import { prisma } from "@/lib/prisma";
import { buildZenFeedXml } from "@/lib/rss";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 900;

const CATEGORY_LABEL_RU: Record<string, string> = {
  news: "Новости",
  analysis: "Аналитика",
  interview: "Интервью"
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtmlBody(sections: Array<{ heading: string | null; body: string }>) {
  return sections
    .flatMap((section) => {
      const heading =
        section.heading && section.heading !== "AI draft" ? [`<h2>${escapeHtml(section.heading)}</h2>`] : [];
      const paragraphs = section.body
        .split(/\n{2,}|\r\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`);
      return [...heading, ...paragraphs];
    })
    .join("");
}

export async function GET() {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      category: { in: ["news", "analysis", "interview"] },
      ...buildPublicArticleImageWhere()
    },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: {
      sections: { orderBy: { sortOrder: "asc" }, select: { heading: true, body: true } }
    }
  });

  const xml = buildZenFeedXml(
    {
      title: "FightBase Media — новости UFC",
      link: `${siteUrl}/ru`,
      description: "Новости UFC, аналитика, прогнозы и интервью от FightBase Media.",
      language: "ru",
      selfUrl: `${siteUrl}/zen.xml`
    },
    articles.map((article) => ({
      title: article.title,
      link: `${siteUrl}${localizePath(getArticleHref(article.category, article.slug), "ru")}`,
      pubDate: article.publishedAt ?? new Date(),
      category: CATEGORY_LABEL_RU[article.category] ?? null,
      imageUrl: article.coverImageUrl ? `${siteUrl}${article.coverImageUrl}` : null,
      htmlBody: toHtmlBody(article.sections)
    }))
  );

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8"
    }
  });
}
