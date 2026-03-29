import Link from "next/link";

import { AdSlot } from "@/components/ad-slot";
import { ArticleCard, EventCard, FighterCard } from "@/components/cards";
import { getHomePageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export default async function HomePage() {
  const locale = await getLocale();
  const { articles, events, fighters } = await getHomePageData();
  const leadArticle = articles[0];
  const leadEvent = events[0];

  return (
    <main>
      <section className="hero-section">
        <div className="container hero-grid">
          <article className="hero-card">
            <p className="eyebrow">{locale === "ru" ? "Тема дня" : "Top story"}</p>
            <h1>
              {locale === "ru"
                ? "ММА-медиа, которое объясняет, а не просто агрегирует"
                : "An MMA newsroom built for explanation, not just aggregation"}
            </h1>
            <p>
              {locale === "ru"
                ? "FightBase строится как медиа-платформа: главная тема, новостной поток, карточки турниров, профили бойцов, рейтинги и аналитика связаны общей базой данных."
                : "FightBase is structured as a media platform first: top story, rolling news, event cards, fighter profiles, rankings, and analysis connected by one shared data layer."}
            </p>
            <div className="header-actions">
              {leadArticle ? (
                <Link href={`/news/${leadArticle.slug}`} className="button">
                  {locale === "ru" ? "Читать материал" : "Read feature"}
                </Link>
              ) : null}
              <Link href="/events" className="button-secondary">
                {locale === "ru" ? "Смотреть турниры" : "View events"}
              </Link>
            </div>
          </article>

          <div className="hero-rail">
            <article className="mini-card red">
              <p className="eyebrow">{locale === "ru" ? "Главный анонс" : "Lead announcement"}</p>
              <h3>
                {locale === "ru"
                  ? "Превью турнира, ставки и влияние на рейтинг в одном материале"
                  : "Event preview, stakes, and ranking consequences in one flow"}
              </h3>
              {leadEvent ? (
                <Link href={`/events/${leadEvent.slug}`}>
                  {locale === "ru" ? "Открыть карточку турнира" : "Open event card"}
                </Link>
              ) : null}
            </article>
            <article className="mini-card gold">
              <p className="eyebrow">{locale === "ru" ? "Срочно" : "Breaking"}</p>
              <h3>
                {locale === "ru"
                  ? "Травмы, замены и анонсы боёв уже готовы к структурированной публикации"
                  : "Injuries, replacements, and fight announcements already have a structured publishing path"}
              </h3>
              <Link href="/news">{locale === "ru" ? "Открыть ленту новостей" : "Open news desk"}</Link>
            </article>
            <article className="mini-card blue">
              <p className="eyebrow">{locale === "ru" ? "Бойцы" : "Fighters"}</p>
              <h3>
                {locale === "ru"
                  ? "Профили бойцов стали полноценными страницами, а не тупиковыми упоминаниями"
                  : "Profiles are now first-class pages instead of dead-end mentions"}
              </h3>
              <Link href="/fighters">{locale === "ru" ? "Открыть базу бойцов" : "Explore roster"}</Link>
            </article>
            <article className="mini-card green">
              <p className="eyebrow">{locale === "ru" ? "Аналитика" : "Analysis"}</p>
              <h3>
                {locale === "ru"
                  ? "Каждый большой бой может порождать тактический разбор и материал формата «что дальше?»"
                  : "Every major fight can spawn tactical and what-next coverage"}
              </h3>
              <Link href="/analysis">{locale === "ru" ? "Читать разборы" : "Read breakdowns"}</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Лента" : "News desk"}</p>
              <h2>{locale === "ru" ? "Свежие материалы" : "Latest stories"}</h2>
            </div>
          </div>
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <AdSlot placement="homeFeed" locale={locale} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Расписание" : "Schedule"}</p>
              <h2>{locale === "ru" ? "Ближайшие и прошедшие турниры" : "Upcoming and completed events"}</h2>
            </div>
            <Link href="/events">{locale === "ru" ? "Все турниры" : "All events"}</Link>
          </div>
          <div className="event-grid">
            {events.map((event) => (
              <EventCard key={event.id} event={event} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Тренды" : "Trending fighters"}</p>
              <h2>{locale === "ru" ? "Профили, построенные для перелинковки" : "Profiles built for internal linking"}</h2>
            </div>
            <Link href="/fighters">{locale === "ru" ? "Вся база бойцов" : "Full fighter database"}</Link>
          </div>
          <div className="fighter-grid">
            {fighters.map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="subscribe">
        <div className="container feature-grid">
          <AdSlot placement="homeHero" locale={locale} className="feature-card" />
          <article className="feature-card">
            <p className="eyebrow">{locale === "ru" ? "Дистрибуция" : "Distribution"}</p>
            <h3>{locale === "ru" ? "Telegram, рассылка и push" : "Telegram, newsletter, and push"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "На главной уже есть место под возвратный трафик, а не только под SEO."
                : "The homepage already reserves real estate for repeat traffic, not just search traffic."}
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">{locale === "ru" ? "Редакционная ценность" : "Editorial value"}</p>
            <h3>{locale === "ru" ? "Что это значит" : "What this means"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Каждый материал может содержать короткий блок интерпретации, чтобы сайт ощущался полезным и редакционным."
                : "Every story can include a short interpretation block so the site feels curated and useful."}
            </p>
          </article>
          <article className="feature-card">
            <p className="eyebrow">AI workflow</p>
            <h3>{locale === "ru" ? "Публикация от сущностей" : "Entity-first publishing"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Одна структура данных питает новости, турниры, бойцов, рейтинги и будущую автоматизацию."
                : "The same data powers stories, events, fighters, rankings, and future automation."}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
