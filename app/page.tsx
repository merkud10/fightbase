import Link from "next/link";

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
          <article className="hero-card editorial-hero-card">
            <p className="eyebrow">{locale === "ru" ? "Тема дня" : "Top story"}</p>
            <h1>
              {locale === "ru"
                ? "MMA-медиа, которое объясняет, а не просто дублирует новости"
                : "An MMA newsroom built to explain, not just aggregate"}
            </h1>
            <p>
              {locale === "ru"
                ? "FightBase строится как настоящее спортивное медиа: сильный хедлайнер, живая новостная лента, карточки турниров, профили бойцов и аналитика, связанная одной редакционной системой."
                : "FightBase is structured like a true sports publication: a strong lead story, a living news desk, event cards, fighter profiles, and analysis tied together by one editorial system."}
            </p>
            <div className="header-actions">
              {leadArticle ? (
                <Link href={`/news/${leadArticle.slug}`} className="button">
                  {locale === "ru" ? "Читать материал" : "Read feature"}
                </Link>
              ) : null}
              <Link href="/news" className="button-secondary">
                {locale === "ru" ? "Открыть новости" : "Open news desk"}
              </Link>
            </div>
          </article>

          <div className="hero-rail editorial-rail">
            <article className="mini-card red editorial-mini-card">
              <p className="eyebrow">{locale === "ru" ? "Главный акцент" : "Lead angle"}</p>
              <h3>
                {locale === "ru"
                  ? "Каждая большая новость может вести в профили бойцов, карточки турниров и разборы"
                  : "Every big story can branch into profiles, event cards, and analysis"}
              </h3>
            </article>
            <article className="mini-card gold editorial-mini-card">
              <p className="eyebrow">{locale === "ru" ? "Ближайший турнир" : "Upcoming event"}</p>
              <h3>{leadEvent ? leadEvent.name : locale === "ru" ? "Карточка турнира" : "Event card"}</h3>
              {leadEvent ? (
                <Link href={`/events/${leadEvent.slug}`}>{locale === "ru" ? "Открыть карточку" : "Open event card"}</Link>
              ) : null}
            </article>
            <article className="mini-card blue editorial-mini-card">
              <p className="eyebrow">{locale === "ru" ? "Бойцы недели" : "Fighters of the week"}</p>
              <h3>
                {locale === "ru"
                  ? "Профили бойцов становятся отдельным ядром всего сайта"
                  : "Fighter profiles become a core layer of the whole site"}
              </h3>
            </article>
            <article className="mini-card green editorial-mini-card">
              <p className="eyebrow">{locale === "ru" ? "Разборы" : "Analysis"}</p>
              <h3>
                {locale === "ru"
                  ? "Прематч, постфайт и тактические материалы делают проект полноценным медиа"
                  : "Pre-fight, post-fight, and tactical coverage make the project a true media brand"}
              </h3>
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
            <Link href="/news" className="section-link">
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
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Турниры" : "Events"}</p>
              <h2>{locale === "ru" ? "Ближайшие и прошедшие турниры" : "Upcoming and completed events"}</h2>
            </div>
            <Link href="/events" className="section-link">
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

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Ростер" : "Roster"}</p>
              <h2>{locale === "ru" ? "Главные бойцы недели" : "Featured fighters"}</h2>
            </div>
            <Link href="/fighters" className="section-link">
              {locale === "ru" ? "Вся база бойцов" : "Full roster"}
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
          <article className="feature-card editorial-card">
            <p className="eyebrow">{locale === "ru" ? "Подписка" : "Subscription"}</p>
            <h3>{locale === "ru" ? "Telegram, email и возвратный трафик" : "Telegram, email, and return traffic"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Структура главной уже готова под подписку, ежедневные дайджесты и редакционные подборки."
                : "The homepage structure is already ready for subscriptions, daily digests, and editorial picks."}
            </p>
          </article>
          <article className="feature-card editorial-card">
            <p className="eyebrow">{locale === "ru" ? "Редакционный слой" : "Editorial layer"}</p>
            <h3>{locale === "ru" ? "Блок «Что это значит»" : "The “What this means” block"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Проект должен объяснять важность события, а не просто пересказывать факт."
                : "The product should explain the importance of an event, not just repeat a fact."}
            </p>
          </article>
          <article className="feature-card editorial-card">
            <p className="eyebrow">AI workflow</p>
            <h3>{locale === "ru" ? "Сущности, драфты и модерация" : "Entities, drafts, and moderation"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Одна и та же data-модель уже связывает новости, турниры, бойцов и будущую автоматизацию."
                : "The same data model already connects stories, events, fighters, and future automation."}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
