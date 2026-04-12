import type { ArticleCategory } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ad-slot";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticleRouteBase } from "@/lib/article-routes";
import { getArticlePageData } from "@/lib/db";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

function splitIntoParagraphs(text: string) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const explicitParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 3) {
    return [normalized];
  }

  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    chunks.push(sentences.slice(index, index + 3).join(" "));
  }

  return chunks;
}

function getSectionLabels(category: ArticleCategory, locale: "ru" | "en") {
  if (locale === "ru") {
    switch (category) {
      case "analysis":
        return { index: "Аналитика", listName: "Аналитические материалы UFC" };
      case "interview":
        return { index: "Интервью", listName: "Интервью и прямая речь UFC" };
      default:
        return { index: "Новости", listName: "Новости UFC" };
    }
  }

  switch (category) {
    case "analysis":
      return { index: "Analysis", listName: "UFC analysis" };
    case "interview":
      return { index: "Interviews", listName: "UFC interviews" };
    default:
      return { index: "News", listName: "UFC news" };
  }
}

export async function generateArticlePageMetadata(
  slug: string,
  category: "news" | "analysis" | "interview"
): Promise<Metadata> {
  const locale = await getLocale();
  const article = await getArticlePageData(slug, category);

  if (!article) {
    return {
      title: locale === "ru" ? "Материал не найден" : "Story not found"
    };
  }

  const articlePath = `${getArticleRouteBase(category)}/${article.slug}`;

  return {
    title: article.title,
    description: article.excerpt,
    alternates: {
      ...buildLocaleAlternates(articlePath),
      canonical: localizePath(articlePath, locale)
    },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      url: localizePath(articlePath, locale),
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      images: article.coverImageUrl
        ? [
            {
              url: article.coverImageUrl,
              alt: article.coverImageAlt || article.title
            }
          ]
        : undefined
    },
    twitter: {
      card: article.coverImageUrl ? "summary_large_image" : "summary",
      title: article.title,
      description: article.excerpt,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined
    }
  };
}

export async function ArticleDetailPage({
  slug,
  category
}: {
  slug: string;
  category: "news" | "analysis" | "interview";
}) {
  const locale = await getLocale();
  const article = await getArticlePageData(slug, category);

  if (!article) {
    notFound();
  }

  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const articlePath = `${getArticleRouteBase(category)}/${article.slug}`;
  const articleUrl = `${siteUrl}${localizePath(articlePath, locale)}`;
  const labels = getSectionLabels(category, locale);
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: labels.index, href: getArticleRouteBase(category) },
    { label: article.title }
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : articleUrl
    }))
  };
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": category === "news" ? "NewsArticle" : "Article",
    headline: article.title,
    description: article.excerpt,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: articleUrl,
    articleSection: labels.listName,
    author: {
      "@type": "Organization",
      name: "FightBase Media"
    },
    publisher: {
      "@type": "Organization",
      name: "FightBase Media"
    }
  };

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={articleJsonLd} />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero title={article.title} />

      <section className="detail-grid">
        <article className="stack">
          {article.coverImageUrl ? (
            <div className="article-cover-shell article-cover-shell--hero">
              <Image
                src={getDisplayImageUrl(article.coverImageUrl)}
                alt={article.coverImageAlt || article.title}
                fill
                priority
                className="article-cover-image"
                sizes="(max-width: 1200px) 100vw, min(1200px, 100vw)"
              />
            </div>
          ) : null}

          <AdSlot placement="articleInline" locale={locale} />

          <div className="policy-card">
            {article.sections.map((section) => (
              <div key={section.id} style={{ marginBottom: 22 }}>
                {section.heading && section.heading !== "AI draft" ? <h3>{section.heading}</h3> : null}
                <div className="article-copy-stack">
                  {splitIntoParagraphs(section.body).map((paragraph, index) => (
                    <p key={`${section.id}-${index}`} className="copy">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="stack">
          <AdSlot placement="articleSidebar" locale={locale} />

          <div className="policy-card">
            <h3>{locale === "ru" ? "Бойцы в материале" : "Fighters in this story"}</h3>
            <ul>
              {article.fighterMap.map(({ fighter }) => (
                <li key={fighter.id}>
                  <Link href={localizePath(`/fighters/${fighter.slug}`, locale)}>{fighter.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанный турнир" : "Linked event"}</h3>
            <p className="copy">
              {article.event ? (
                <Link href={localizePath(`/events/${article.event.slug}`, locale)}>{article.event.name}</Link>
              ) : locale === "ru" ? (
                "Для этого материала отдельный турнир не указан."
              ) : (
                "No standalone event is linked to this story."
              )}
            </p>
          </div>

          {article.sourceMap.length > 0 ? (
            <div className="policy-card">
              <h3>{locale === "ru" ? "Источник" : "Source"}</h3>
              <ul className="event-side-list">
                {article.sourceMap.map(({ source }) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
