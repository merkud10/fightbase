import type { Metadata } from "next";
import Link from "next/link";

import { ArticleCard } from "@/components/cards";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getPredictionEditorialPageData, getPredictionsPageData } from "@/lib/db";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 86400;


function hasUsablePhoto(url?: string | null) {
  return (
    Boolean(url) &&
    !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(
      String(url)
    )
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Прогнозы UFC",
    description: "Превью ключевых боев UFC: главные матчапы, стилистические детали и отдельные snapshot-страницы по каждому поединку.",
    alternates: buildLocaleAlternates("/predictions")
  };
}

export default async function PredictionsPage() {
  const locale = await getLocale();
  const [events, articles] = await Promise.all([getPredictionsPageData(), getPredictionEditorialPageData()]);
  const siteUrl = getSiteUrl();
  const eventsWithSnapshots = events.map((event) => ({
    ...event,
    fights: event.fights.filter((fight) => fight.predictionSnapshot)
  })).filter((event) => event.fights.length > 0);
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions" }
  ];
  const itemList = eventsWithSnapshots.flatMap((event) =>
    event.fights.map((fight, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(localizePath(`/predictions/${event.slug}/${fight.slug}`, locale), siteUrl).toString(),
      name: `${getDisplayName(fight.fighterA, locale)} vs ${getDisplayName(fight.fighterB, locale)}`
    }))
  );

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Прогнозы UFC" : "UFC predictions",
          url: new URL(localizePath("/predictions", locale), siteUrl).toString()
        }}
      />
      {itemList.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Лента прогнозов UFC" : "UFC prediction desk",
            itemListElement: itemList
          }}
        />
      ) : null}

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/predictions"
        title={locale === "ru" ? "Прогнозы" : "Predictions"}
        description={
          locale === "ru"
            ? "Превью главных боев ближайших турниров UFC: ключевой матчап, весовая категория и отдельная страница по каждому поединку."
            : "Previews of the key fights on upcoming UFC cards, with a dedicated page for each matchup."
        }
      />

      {eventsWithSnapshots.length === 0 && articles.length === 0 ? (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Прогнозные страницы пока не готовы" : "Prediction pages are not ready yet"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "После ближайшего суточного обновления коэффициентов и snapshot-данных здесь появятся готовые превью боев UFC."
              : "Ready-made UFC fight previews will appear here after the next scheduled odds and snapshot update."}
          </p>
        </section>
      ) : null}

      {articles.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
                <p className="eyebrow">{locale === "ru" ? "Материалы" : "Stories"}</p>
                <h2>{locale === "ru" ? "Превью и разборы" : "Previews and breakdowns"}</h2>
            </div>
          </div>
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="stack predictions-stack">
        {eventsWithSnapshots.map((event) => (
          <article key={event.id} className="table-card prediction-event-card prediction-event-card--featured">
            <div className="prediction-event-head">
              <div>
                <p className="kicker">
                  {event.promotion.shortName} · {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {event.city}
                </p>
                <h3>{event.name}</h3>
              </div>
              <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary">
                {locale === "ru" ? "Страница турнира" : "Event page"}
              </Link>
            </div>

            <div className="prediction-match-grid">
              {event.fights.map((fight) => {
                const fighterAName = getDisplayName(fight.fighterA, locale);
                const fighterBName = getDisplayName(fight.fighterB, locale);
                const snapshot = fight.predictionSnapshot;
                const hasSnapshot = Boolean(snapshot);
                const percentA = snapshot?.percentA ?? 0;
                const percentB = snapshot?.percentB ?? 0;

                const cardInner = (
                  <>
                    <div className="prediction-match-visual">
                      {hasUsablePhoto(fight.fighterA.photoUrl) ? (
                        <img src={String(fight.fighterA.photoUrl)} alt={fighterAName} className="prediction-match-photo" />
                      ) : (
                        <div className="prediction-match-photo prediction-match-photo--placeholder">{fighterAName.charAt(0)}</div>
                      )}
                      {hasUsablePhoto(fight.fighterB.photoUrl) ? (
                        <img src={String(fight.fighterB.photoUrl)} alt={fighterBName} className="prediction-match-photo" />
                      ) : (
                        <div className="prediction-match-photo prediction-match-photo--placeholder">{fighterBName.charAt(0)}</div>
                      )}
                    </div>
                    <div className="prediction-match-copy">
                      <strong>
                        {fighterAName} vs {fighterBName}
                      </strong>
                      <span>{formatWeightClass(fight.weightClass, locale)}</span>
                      <small>
                        {hasSnapshot
                          ? locale === "ru" ? "Открыть превью боя" : "Open fight preview"
                          : locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}
                      </small>
                    </div>
                    {hasSnapshot ? (
                      <div className="prediction-match-meter">
                        <div className="prediction-meter">
                          <div className="prediction-meter-fill" style={{ width: `${percentA}%` }} />
                        </div>
                        <div className="prediction-meter-scale">
                          <span>{percentA}%</span>
                          <span className="prediction-meter-source">{locale === "ru" ? "прогноз" : "preview"}</span>
                          <span>{percentB}%</span>
                        </div>
                      </div>
                    ) : null}
                  </>
                );

                return hasSnapshot ? (
                  <Link
                    key={fight.id}
                    href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
                    className="prediction-match-card prediction-match-card--visual"
                  >
                    {cardInner}
                  </Link>
                ) : (
                  <div key={fight.id} className="prediction-match-card prediction-match-card--visual prediction-match-card--pending">
                    {cardInner}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
