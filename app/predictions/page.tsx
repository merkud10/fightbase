import type { Metadata } from "next";
import Link from "next/link";

import { ArticleCard } from "@/components/cards";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getPredictionEditorialPageData, getPredictionsPageData } from "@/lib/db";
import { formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

function getDisplayName(
  fighter: { name: string; nameRu?: string | null },
  locale: "ru" | "en"
) {
  return locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
}

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
    title: "Прогнозы MMA",
    description:
      "Прогнозы на ближайшие бои UFC, PFL и ONE: ключевые матчапы, важные стилистические столкновения и отдельная страница для каждого боя.",
    alternates: buildLocaleAlternates("/predictions")
  };
}

export default async function PredictionsPage() {
  const locale = await getLocale();
  const [events, articles] = await Promise.all([getPredictionsPageData(), getPredictionEditorialPageData()]);
  const siteUrl = getSiteUrl();
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions" }
  ];
  const itemList = events.flatMap((event) =>
    event.fights.map((fight, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(localizePath(`/predictions/${event.slug}/${fight.id}`, locale), siteUrl).toString(),
      name: `${getDisplayName(fight.fighterA, locale)} vs ${getDisplayName(fight.fighterB, locale)}`
    }))
  );

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Прогнозы MMA" : "MMA predictions",
          url: new URL(localizePath("/predictions", locale), siteUrl).toString()
        }}
      />
      {itemList.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Лента прогнозов" : "Prediction desk",
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
            ? "Главные бои ближайших турниров UFC, PFL и ONE: матчап, весовая категория и быстрый переход к отдельному прогнозу."
            : "The key fights on upcoming UFC, PFL, and ONE cards with a dedicated preview page for every matchup."
        }
      />

      {articles.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Editorial" : "Editorial"}</p>
              <h2>{locale === "ru" ? "Превью, расклады и прогнозы" : "Fight previews and prediction stories"}</h2>
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
        {events.map((event) => (
          <article key={event.id} className="table-card prediction-event-card prediction-event-card--featured">
            <div className="prediction-event-head">
              <div>
                <p className="kicker">
                  {event.promotion.shortName} · {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {event.city}
                </p>
                <h3>{event.name}</h3>
              </div>
              <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary">
                {locale === "ru" ? "Карточка турнира" : "Event card"}
              </Link>
            </div>

            <div className="prediction-match-grid">
              {event.fights.map((fight) => {
                const fighterAName = getDisplayName(fight.fighterA, locale);
                const fighterBName = getDisplayName(fight.fighterB, locale);

                return (
                  <Link
                    key={fight.id}
                    href={localizePath(`/predictions/${event.slug}/${fight.id}`, locale)}
                    className="prediction-match-card prediction-match-card--visual"
                  >
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
                      <small>{locale === "ru" ? "Открыть прогноз боя" : "Open matchup prediction"}</small>
                    </div>
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
