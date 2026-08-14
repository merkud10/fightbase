import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

import { ArticleCard, FighterCard } from "@/components/cards";
import { PageHero } from "@/components/page-hero";
import { searchSite } from "@/lib/db";
import { formatEventLocation } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";
import { readParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return {
    ...buildPageMetadata({
      locale,
      path: "/search",
      title: locale === "ru" ? "Поиск" : "Search",
      description:
        locale === "ru"
          ? "Поиск по статьям, бойцам и турнирам FightBase Media."
          : "Search FightBase Media stories, fighters, and events."
    }),
    robots: {
      index: false,
      follow: true
    }
  };
}

export default async function SearchPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const query = readParam(params.q).slice(0, 80);
  const results = await searchSite(query);
  const hasQuery = results.query.length >= 2;
  const totalFound = results.articles.length + results.fighters.length + results.events.length;

  return (
    <main className="container">
      <PageHero
        title={locale === "ru" ? "Поиск" : "Search"}
        description={
          locale === "ru"
            ? "Статьи, бойцы и турниры — в одном поиске."
            : "Stories, fighters, and events in one search."
        }
      />

      <section className="policy-card">
        <form method="get" action={localizePath("/search", locale)} className="fighter-search-form">
          <label className="sr-only" htmlFor="site-search-input">
            {locale === "ru" ? "Поисковый запрос" : "Search query"}
          </label>
          <input
            id="site-search-input"
            type="search"
            name="q"
            defaultValue={results.query}
            placeholder={locale === "ru" ? "Например: Махачев или UFC 330" : "e.g. Makhachev or UFC 330"}
            maxLength={80}
          />
          <button type="submit" className="button-secondary">
            {locale === "ru" ? "Найти" : "Search"}
          </button>
        </form>
      </section>

      {hasQuery && totalFound === 0 ? (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Ничего не найдено" : "Nothing found"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Попробуйте другое написание имени или название турнира."
              : "Try a different spelling or an event name."}
          </p>
        </section>
      ) : null}

      {results.fighters.length > 0 ? (
        <section className="section stack">
          <div className="section-head">
            <div className="section-head-copy">
              <h2>{locale === "ru" ? "Бойцы" : "Fighters"}</h2>
            </div>
          </div>
          <div className="fighter-grid">
            {results.fighters.map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      {results.events.length > 0 ? (
        <section className="section stack">
          <div className="section-head">
            <div className="section-head-copy">
              <h2>{locale === "ru" ? "Турниры" : "Events"}</h2>
            </div>
          </div>
          <div className="policy-card">
            <ul className="event-side-list">
              {results.events.map((event) => (
                <li key={event.id}>
                  <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>
                  {" — "}
                  {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC"
                  }).format(event.date)}
                  {formatEventLocation(event.city, event.venue, locale)
                    ? ` · ${formatEventLocation(event.city, event.venue, locale)}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {results.articles.length > 0 ? (
        <section className="section stack">
          <div className="section-head">
            <div className="section-head-copy">
              <h2>{locale === "ru" ? "Материалы" : "Stories"}</h2>
            </div>
          </div>
          <div className="story-grid">
            {results.articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
