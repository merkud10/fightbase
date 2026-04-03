import type { Metadata } from "next";
import Link from "next/link";

import { ArticleCard, EventCard, FighterCard } from "@/components/cards";
import { JsonLd } from "@/components/json-ld";
import { getHomePageData } from "@/lib/db";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isRu = locale === "ru";
  const title = isRu
    ? "FightBase Media - новости UFC, прогнозы, бойцы и турниры"
    : "FightBase Media - UFC news, predictions, fighters, and events";
  const description = isRu
    ? "FightBase Media освещает UFC как профильное спортивное медиа: новости, карточки турниров, прогнозы на бои, профили бойцов и рейтинги."
    : "FightBase Media covers UFC as a specialist sports publication with news, event pages, fight predictions, fighter profiles, and rankings.";

  return {
    title,
    description,
    alternates: {
      ...buildLocaleAlternates("/"),
      canonical: localizePath("/", locale)
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: localizePath("/", locale)
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}


export default async function HomePage() {
  const locale = await getLocale();
  const { articles, events, fighters } = await getHomePageData();
  const leadArticle = articles[0];
  const leadEvent = events[0];
  const leadFight = leadEvent?.fights?.[0];
  const supportFight = leadEvent?.fights?.[1];
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/", locale), siteUrl).toString();
  const itemListElements = [
    ...articles.slice(0, 4).map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(localizePath(`/news/${article.slug}`, locale), siteUrl).toString(),
      name: article.title
    })),
    ...events.slice(0, 4).map((event, index) => ({
      "@type": "ListItem",
      position: articles.slice(0, 4).length + index + 1,
      url: new URL(localizePath(`/events/${event.slug}`, locale), siteUrl).toString(),
      name: event.name
    }))
  ];

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "FightBase Media - UFC",
          url: pageUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US",
          description:
            locale === "ru"
              ? "Главная страница FightBase Media с новостями UFC, турнирами, прогнозами и профилями бойцов."
              : "FightBase Media homepage with UFC news, event coverage, predictions, and fighter profiles."
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Ключевые материалы FightBase Media" : "FightBase Media featured content",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <section className="hero-section">
        <div className="container hero-grid hero-grid-poster">
          <article className="hero-card editorial-hero-card hero-card-poster">
            <div className="hero-poster-topline">
              <span>{locale === "ru" ? "Постер недели" : "Poster of the week"}</span>
              <span>{locale === "ru" ? "FightBase Media" : "FightBase Media"}</span>
            </div>

            <div className="hero-poster-body">
              <p className="eyebrow">{leadEvent ? leadEvent.name : "FightBase Media"}</p>

              <h1>
                {leadFight
                  ? `${getDisplayName(leadFight.fighterA, locale)} vs ${getDisplayName(leadFight.fighterB, locale)}`
                  : locale === "ru"
                    ? "UFC без шума и пустых пересказов"
                    : "UFC coverage without noise or empty rewrites"}
              </h1>

              <div className="hero-poster-subline">
                {leadFight ? (
                  <>
                    <span>{leadEvent?.promotion?.shortName ?? "UFC"}</span>
                    <span>{new Date(leadEvent.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</span>
                    <span>{leadEvent.city}</span>
                    <span>{formatWeightClass(leadFight.weightClass, locale)}</span>
                  </>
                ) : (
                  <>
                    <span>FightBase Media</span>
                    <span>{locale === "ru" ? "Новости, аналитика, прогнозы" : "News, analysis, predictions"}</span>
                  </>
                )}
              </div>

              <p className="hero-poster-copy">
                {leadFight
                  ? locale === "ru"
                    ? "Главный бой недели, турнирная страница, ключевой контекст и отдельное превью по матчапу собраны в одном месте."
                    : "The main fight of the week with the event page, context, and a dedicated matchup preview gathered in one place."
                  : locale === "ru"
                    ? "FightBase освещает UFC как профильное спортивное медиа: новости, контекст, турнирные страницы, профили бойцов, рейтинги и предматчевые разборы."
                    : "FightBase covers UFC like a specialist sports publication with news, context, event pages, fighter profiles, rankings, and pre-fight analysis."}
              </p>

              {leadFight ? (
                <div className="hero-fight-tape">
                  <div className="hero-fight-corner">
                    <span>{locale === "ru" ? "Красный угол" : "Red corner"}</span>
                    <strong>{getDisplayName(leadFight.fighterA, locale)}</strong>
                  </div>
                  <div className="hero-fight-divider">VS</div>
                  <div className="hero-fight-corner hero-fight-corner--right">
                    <span>{locale === "ru" ? "Синий угол" : "Blue corner"}</span>
                    <strong>{getDisplayName(leadFight.fighterB, locale)}</strong>
                  </div>
                </div>
              ) : null}

              <div className="hero-action-row">
                {leadEvent ? (
                  <Link href={localizePath(`/events/${leadEvent.slug}`, locale)} className="button">
                    {locale === "ru" ? "Открыть турнир" : "Open event"}
                  </Link>
                ) : null}
                {leadFight?.predictionSnapshot ? (
                  <Link href={localizePath(`/predictions/${leadEvent.slug}/${leadFight.id}`, locale)} className="button-secondary">
                    {locale === "ru" ? "Превью боя" : "Fight preview"}
                  </Link>
                ) : (
                  <Link href={localizePath("/news", locale)} className="button-secondary">
                    {locale === "ru" ? "Лента новостей" : "News feed"}
                  </Link>
                  )}
                </div>
              </div>

              <div className="hero-gorilla-sigil" aria-hidden="true">
                <img src="/gorilla-crown-logo.png" alt="" />
              </div>

              <div className="hero-poster-mark">
                <span>UFC</span>
              </div>
            </article>

          <div className="hero-rail editorial-rail hero-rail-poster">
            <article className="mini-card red editorial-mini-card hero-rail-card hero-rail-card--lead">
              <p className="eyebrow">{locale === "ru" ? "Турнир недели" : "Event of the week"}</p>
              <h3>{leadEvent ? leadEvent.name : locale === "ru" ? "Ближайший турнир UFC" : "Upcoming UFC event"}</h3>
              <p className="copy">
                {leadFight
                  ? `${getDisplayName(leadFight.fighterA, locale)} vs ${getDisplayName(leadFight.fighterB, locale)}`
                  : locale === "ru"
                    ? "Главный турнир недели с полной карточкой боев."
                    : "The key card of the week with a full fight lineup."}
              </p>
              {leadEvent ? (
                <Link href={localizePath(`/events/${leadEvent.slug}`, locale)} className="editorial-inline-link">
                  {locale === "ru" ? "Страница турнира" : "Event page"}
                </Link>
              ) : null}
            </article>

            <article className="mini-card gold editorial-mini-card hero-rail-card">
              <p className="eyebrow">{locale === "ru" ? "Главный сюжет" : "Lead angle"}</p>
              <h3>
                {supportFight
                  ? `${getDisplayName(supportFight.fighterA, locale)} vs ${getDisplayName(supportFight.fighterB, locale)}`
                  : locale === "ru"
                    ? "Главные новости недели по UFC"
                    : "The biggest UFC storylines of the week"}
              </h3>
              <p className="copy">
                {locale === "ru"
                  ? "Редакционные входы в самые важные события недели без перегруженного визуального шума."
                  : "Editorial entry points into the week's most important developments without excess visual noise."}
              </p>
            </article>

            <article className="mini-card blue editorial-mini-card hero-rail-card">
              <p className="eyebrow">{locale === "ru" ? "Редакционный ритм" : "Editorial rhythm"}</p>
              <div className="hero-stat-strip hero-stat-strip-compact">
                <div className="hero-stat-card">
                  <strong>{articles.length}</strong>
                  <span>{locale === "ru" ? "материалов в ленте" : "stories in the feed"}</span>
                </div>
                <div className="hero-stat-card">
                  <strong>{events.length}</strong>
                  <span>{locale === "ru" ? "страниц турниров UFC" : "UFC event pages"}</span>
                </div>
                <div className="hero-stat-card">
                  <strong>{fighters.length}</strong>
                  <span>{locale === "ru" ? "профилей бойцов" : "fighter profiles"}</span>
                </div>
              </div>
            </article>

            {leadArticle ? (
              <article className="mini-card green editorial-mini-card hero-rail-card">
                <p className="eyebrow">{locale === "ru" ? "Что читать" : "What to read"}</p>
                <h3>{leadArticle.title}</h3>
                <Link href={localizePath(`/news/${leadArticle.slug}`, locale)} className="editorial-inline-link">
                  {locale === "ru" ? "Читать материал" : "Read feature"}
                </Link>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section section-surface">
        <div className="container">
          <div className="section-head section-head-rich">
            <div className="section-head-copy">
              <p className="eyebrow">{locale === "ru" ? "Новости" : "News"}</p>
              <h2>{locale === "ru" ? "Последние материалы" : "Latest stories"}</h2>
              <p className="copy">
                {locale === "ru"
                  ? "Быстрая редакционная лента по ключевым новостям UFC без лишнего шума и второстепенных пересказов."
                  : "A fast editorial stream focused on the UFC stories that actually move the division picture."}
              </p>
            </div>
            <Link href={localizePath("/news", locale)} className="section-link">
              {locale === "ru" ? "Все новости" : "All stories"}
            </Link>
          </div>
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head section-head-rich">
            <div className="section-head-copy">
              <p className="eyebrow">{locale === "ru" ? "Турниры" : "Events"}</p>
              <h2>{locale === "ru" ? "Ближайшие и прошедшие турниры" : "Upcoming and completed events"}</h2>
              <p className="copy">
                {locale === "ru"
                  ? "Турнирные страницы с карточками боев, быстрым контекстом и переходом к прогнозам там, где они уже готовы."
                  : "Event pages built around fight cards, fast context, and prediction pages where they are already available."}
              </p>
            </div>
            <Link href={localizePath("/events", locale)} className="section-link">
              {locale === "ru" ? "Все турниры" : "All events"}
            </Link>
          </div>
          <div className="event-grid">
            {events.map((event) => (
              <EventCard key={event.id} event={event} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section section-surface">
        <div className="container">
          <div className="section-head section-head-rich">
            <div className="section-head-copy">
              <p className="eyebrow">{locale === "ru" ? "Бойцы" : "Fighters"}</p>
              <h2>{locale === "ru" ? "Профили бойцов" : "Fighter profiles"}</h2>
              <p className="copy">
                {locale === "ru"
                  ? "Статистика, статус, дивизион и быстрый вход в экосистему материалов вокруг конкретного бойца."
                  : "Stats, status, division context, and a clean entry point into the coverage around each fighter."}
              </p>
            </div>
            <Link href={localizePath("/fighters", locale)} className="section-link">
              {locale === "ru" ? "Все профили" : "All profiles"}
            </Link>
          </div>
          <div className="fighter-grid">
            {fighters.map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="subscribe">
        <div className="container feature-grid editorial-feature-grid">
          <article className="feature-card editorial-card feature-card-emphasis">
            <p className="eyebrow">{locale === "ru" ? "Повестка" : "Coverage"}</p>
            <h3>{locale === "ru" ? "Новости не живут отдельно от контекста" : "News does not live apart from context"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "FightBase связывает новость с бойцом, бойца с дивизионом, а дивизион с ближайшим турниром и главным матчапом."
                : "FightBase connects the story to the fighter, the fighter to the division, and the division to the next relevant event and matchup."}
            </p>
          </article>
          <article className="feature-card editorial-card feature-card-emphasis">
            <p className="eyebrow">{locale === "ru" ? "Аналитика" : "Analysis"}</p>
            <h3>{locale === "ru" ? "Предматчевые страницы как отдельный редакционный слой" : "Pre-fight pages as a dedicated editorial layer"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Прогнозные страницы не подменяют новости, а дополняют их: дают короткий вывод, сценарий боя и рабочую точку входа в матчап."
                : "Prediction pages complement the news cycle with a concise take, likely fight script, and a direct entry point into the matchup."}
            </p>
          </article>
          <article className="feature-card editorial-card feature-card-emphasis">
            <p className="eyebrow">{locale === "ru" ? "Навигация" : "Navigation"}</p>
            <h3>{locale === "ru" ? "Сайт собран как единая UFC-система" : "The site is built as one UFC system"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Разделы новостей, турниров, бойцов, рейтингов и прогнозов работают как единое пространство, а не как набор разрозненных страниц."
                : "News, events, fighters, rankings, and predictions work as one connected space rather than a loose set of pages."}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
