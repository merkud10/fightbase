import type { Metadata } from "next";
import Link from "next/link";

import { ArticleCard } from "@/components/cards";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getNewsPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

type NewsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function generateMetadata({ searchParams }: NewsPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const tag = readParam(params.tag);
  const hasFilters = Boolean(promotion || tag);
  const localizedUrl = localizePath("/news", locale);

  return {
    title: "Новости MMA",
    description:
      "Лента новостей MMA от FightBase Media: UFC, PFL, ONE, анонсы боёв, результаты турниров и ключевые обновления по бойцам.",
    alternates: buildLocaleAlternates("/news"),
    openGraph: {
      title: "Новости MMA",
      description:
        "Лента новостей MMA от FightBase Media: UFC, PFL, ONE, анонсы боёв, результаты турниров и ключевые обновления по бойцам.",
      url: localizedUrl
    },
    robots: hasFilters
      ? {
          index: false,
          follow: true
        }
      : undefined
  };
}

function buildFilterHref(current: { promotion: string; tag: string }, next: Partial<{ promotion: string; tag: string }>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };

  if (merged.promotion) {
    params.set("promotion", merged.promotion);
  }

  if (merged.tag) {
    params.set("tag", merged.tag);
  }

  const query = params.toString();
  return query ? `/news?${query}` : "/news";
}

function FilterSection({
  title,
  items,
  activeValue,
  current,
  param
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  activeValue: string;
  current: { promotion: string; tag: string };
  param: "promotion" | "tag";
}) {
  return (
    <div className="filter-block">
      <h4>{title}</h4>
      <div className="filter-chip-row">
        <Link
          href={buildFilterHref(current, { [param]: "" })}
          className={`filter-chip ${activeValue === "" ? "active" : ""}`}
        >
          Все
        </Link>
        {items.map((item) => (
          <Link
            key={item.value}
            href={buildFilterHref(current, { [param]: activeValue === item.value ? "" : item.value })}
            className={`filter-chip ${activeValue === item.value ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const tag = readParam(params.tag);
  const { promotions, tags, articles, filters } = await getNewsPageData({
    promotion,
    tag
  });

  const current = {
    promotion: filters.promotion,
    tag: filters.tag
  };
  const activeFiltersCount = [filters.promotion, filters.tag].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL("/news", siteUrl).toString();
  const itemListElements = articles.slice(0, 12).map((article, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(`/news/${article.slug}`, siteUrl).toString(),
    name: article.title
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Новости MMA" : "MMA News",
          url: collectionUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Лента новостей MMA" : "MMA news feed",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <PageHero
        eyebrow="/news"
        title={locale === "ru" ? "Новости" : "News"}
        description={
          locale === "ru"
            ? "Главная новостная лента с быстрыми фильтрами по лигам и темам материалов."
            : "The main news feed with quick filters for promotions and story categories."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href="/news" className="button-ghost filter-reset-link">
                  {locale === "ru" ? "Сбросить" : "Reset"}
                </Link>
              ) : null}
            </div>

            <FilterSection
              title={locale === "ru" ? "Лиги" : "Promotions"}
              items={promotions.map((promotionItem) => ({
                value: promotionItem.slug,
                label: promotionItem.shortName
              }))}
              activeValue={filters.promotion}
              current={current}
              param="promotion"
            />

            <FilterSection
              title={locale === "ru" ? "Категории" : "Categories"}
              items={tags.map((tagItem) => ({
                value: tagItem.slug,
                label: tagItem.label
              }))}
              activeValue={filters.tag}
              current={current}
              param="tag"
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Найдено новостей: ${articles.length}` : `Articles found: ${articles.length}`}
            </p>
          </div>
        </aside>

        {articles.length > 0 ? (
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        ) : (
          <section className="filter-empty-state">
            <h3>{locale === "ru" ? "По этим фильтрам ничего не найдено" : "No articles match these filters"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Попробуй снять часть фильтров, чтобы расширить новостную выборку."
                : "Try clearing some filters to broaden the news feed."}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
