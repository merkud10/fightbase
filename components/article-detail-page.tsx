import type { ArticleCategory } from "@prisma/client";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { AdSlot } from "@/components/ad-slot";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticleRouteBase, resolveMovedArticlePath } from "@/lib/article-routes";
import { ArticleCard } from "@/components/cards";
import { getArticlePageData, getRelatedArticles } from "@/lib/db";
import { segmentFighterMentions } from "@/lib/fighter-mentions";
import { formatArticleTagLabel } from "@/lib/display";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";
import { ShareButtons } from "@/components/share-buttons";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { clampDescription, ogImageUrl } from "@/lib/seo";
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

// Ищем тот же slug без привязки к рубрике: если материал нашёлся, значит он
// переехал, и старый адрес должен отдать 308 на новый вместо 404.
async function redirectMovedArticle(slug: string, category: ArticleCategory, locale: Locale) {
  const moved = await getArticlePageData(slug);

  if (!moved) {
    return;
  }

  const path = resolveMovedArticlePath(category, moved.category, moved.slug);

  if (path) {
    permanentRedirect(localizePath(path, locale));
  }
}

export async function generateArticlePageMetadata(
  slug: string,
  category: "news" | "analysis" | "interview"
): Promise<Metadata> {
  const locale = await getLocale();
  const article = await getArticlePageData(slug, category);

  if (!article) {
    // Тот же slug мог переехать в другую рубрику — тогда старый адрес ведёт на
    // новый, а не в 404. Редирект, как и notFound(), обязан сработать здесь:
    // метаданные считаются до того, как уйдёт 200 из loading-границы.
    await redirectMovedArticle(slug, category, locale);
    // notFound() here (not only in the page body) is what makes the response a real
    // HTTP 404: metadata resolves before streaming starts, while the page body runs
    // after the 200 shell has already been flushed through the loading boundary.
    notFound();
  }

  const articlePath = `${getArticleRouteBase(category)}/${article.slug}`;
  const description = clampDescription(article.excerpt);
  const ogImage = ogImageUrl(article.coverImageUrl);

  return {
    title: article.title,
    description,
    alternates: {
      ...buildLocaleAlternates(articlePath),
      canonical: localizePath(articlePath, locale)
    },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: localizePath(articlePath, locale),
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      images: [
        {
          url: ogImage,
          alt: article.coverImageAlt || article.title
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [ogImage]
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
    await redirectMovedArticle(slug, category, locale);
    notFound();
  }

  const relatedArticles = await getRelatedArticles({
    articleId: article.id,
    category,
    eventId: article.eventId,
    fighterIds: article.fighterMap.map(({ fighter }) => fighter.id)
  });

  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const articlePath = `${getArticleRouteBase(category)}/${article.slug}`;
  const articleUrl = `${siteUrl}${localizePath(articlePath, locale)}`;
  const articleImageUrl = ogImageUrl(article.coverImageUrl);
  const primarySource = article.sourceMap[0]?.source;
  const dateLocale = locale === "ru" ? "ru-RU" : "en-US";
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(dateLocale, {
      dateStyle: "long",
      timeZone: "Europe/Moscow"
    }).format(date);
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
    image: [articleImageUrl],
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: articleUrl,
    articleSection: labels.listName,
    author: {
      "@type": "Organization",
      name: "FightBase Media",
      url: `${siteUrl}/ru`
    },
    publisher: {
      "@type": "Organization",
      name: "FightBase Media",
      url: `${siteUrl}/ru`
    },
    keywords: article.tagMap.map(({ tag }) => formatArticleTagLabel(tag.slug || tag.label, locale))
  };

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={articleJsonLd} />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero title={article.title} description={article.excerpt} />

      <section className="policy-card" aria-label={locale === "ru" ? "Данные материала" : "Story details"}>
        <p className="kicker">
          {locale === "ru" ? "Автор" : "By"}: FightBase Media
        </p>
        <p className="copy">
          {locale === "ru" ? "Опубликовано" : "Published"}: {" "}
          <time dateTime={article.publishedAt.toISOString()}>{formatDate(article.publishedAt)}</time>
          {" · "}
          {locale === "ru" ? "Обновлено" : "Updated"}: {" "}
          <time dateTime={article.updatedAt.toISOString()}>{formatDate(article.updatedAt)}</time>
        </p>
        {primarySource ? (
          <p className="copy">
            {locale === "ru" ? "Первоисточник" : "Original source"}: {" "}
            <a href={primarySource.url} target="_blank" rel="noopener noreferrer">
              {primarySource.label}
            </a>
          </p>
        ) : null}
        {article.tagMap.length > 0 ? (
          <p className="copy">
            {locale === "ru" ? "Темы" : "Topics"}: {" "}
            {article.tagMap
              .map(({ tag }) => formatArticleTagLabel(tag.slug || tag.label, locale))
              .join(" · ")}
          </p>
        ) : null}
      </section>

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
                sizes="(max-width: 1200px) 100vw, 1200px"
              />
            </div>
          ) : null}

          <AdSlot placement="articleInline" locale={locale} />

          <div className="policy-card">
            {(() => {
              const mentionFighters = article.fighterMap.map(({ fighter }) => ({
                slug: fighter.slug,
                name: fighter.name,
                nameRu: fighter.nameRu
              }));
              const linkedFighters = new Set<string>();

              return article.sections.map((section) => (
                <div key={section.id} style={{ marginBottom: 22 }}>
                  {section.heading && section.heading !== "AI draft" ? <h3>{section.heading}</h3> : null}
                  <div className="article-copy-stack">
                    {splitIntoParagraphs(section.body).map((paragraph, index) => (
                      <p key={`${section.id}-${index}`} className="copy">
                        {segmentFighterMentions(paragraph, mentionFighters, linkedFighters).map((segment, segmentIndex) =>
                          segment.type === "fighter" ? (
                            <Link
                              key={`${section.id}-${index}-${segmentIndex}`}
                              href={localizePath(`/fighters/${segment.slug}`, locale)}
                            >
                              {segment.value}
                            </Link>
                          ) : (
                            segment.value
                          )
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>

          <ShareButtons url={articleUrl} title={article.title} locale={locale} />
        </article>

        <aside className="stack">
          <AdSlot placement="articleSidebar" locale={locale} />

          {article.fighterMap.length > 0 ? (
            <div className="policy-card">
              <h3>{locale === "ru" ? "Бойцы в материале" : "Fighters in this story"}</h3>
              <ul>
                {article.fighterMap.map(({ fighter }) => (
                  <li key={fighter.id}>
                    <Link href={localizePath(`/fighters/${fighter.slug}`, locale)}>
                      {(locale === "ru" ? fighter.nameRu : null) ?? fighter.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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

      {relatedArticles.length > 0 ? (
        <section className="section stack" aria-label={locale === "ru" ? "Читайте также" : "Read next"}>
          <div className="section-head">
            <div className="section-head-copy">
              <h2>{locale === "ru" ? "Читайте также" : "Read next"}</h2>
            </div>
          </div>
          <div className="story-grid">
            {relatedArticles.map((related) => (
              <ArticleCard key={related.id} article={related} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
