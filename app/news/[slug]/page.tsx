import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ad-slot";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticlePageData } from "@/lib/db";
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

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const article = await getArticlePageData(slug);

  if (!article) {
    return {
      title: "Материал не найден"
    };
  }

  return {
    title: article.title,
    description: article.excerpt,
    alternates: {
      ...buildLocaleAlternates(`/news/${article.slug}`),
      canonical: localizePath(`/news/${article.slug}`, locale)
    },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      url: localizePath(`/news/${article.slug}`, locale),
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

export default async function ArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const article = await getArticlePageData(slug);

  if (!article) {
    notFound();
  }

  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const articleUrl = `${siteUrl}${localizePath(`/news/${article.slug}`, locale)}`;
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Новости" : "News", href: "/news" },
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
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: articleUrl,
    articleSection: article.category,
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
      <PageHero eyebrow={`/${article.category}`} title={article.title} description={article.excerpt} />

      <section className="detail-grid">
        <article className="stack">
          {article.coverImageUrl ? (
            <div className="article-cover-shell">
              <img
                src={article.coverImageUrl}
                alt={article.coverImageAlt || article.title}
                className="article-cover-image"
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
            <h3>{locale === "ru" ? "Источники" : "Sources"}</h3>
            <ul>
              {article.sourceMap.map(({ source }) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Бойцы в материале" : "Fighters in this story"}</h3>
            <ul>
              {article.fighterMap.map(({ fighter }) => (
                <li key={fighter.id}>
                  <Link href={`/fighters/${fighter.slug}`}>{fighter.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанный турнир" : "Linked event"}</h3>
            <p className="copy">
              {article.event ? (
                <Link href={`/events/${article.event.slug}`}>{article.event.name}</Link>
              ) : locale === "ru" ? (
                "Для этого материала отдельный турнир не указан."
              ) : (
                "No standalone event is linked to this story."
              )}
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
