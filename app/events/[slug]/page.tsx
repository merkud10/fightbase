import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import { getEventPageData } from "@/lib/db";
import { formatFightStage, formatFightStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";

export default async function EventPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getEventPageData(slug);

  if (!data) {
    notFound();
  }

  const { event, relatedArticles } = data;

  return (
    <main className="container">
      <PageHero
        eyebrow={`/events/${event.slug}`}
        title={event.name}
        description={`${event.promotion.shortName} - ${event.city} - ${event.venue} - ${event.summary}`}
      />

      <section className="detail-grid">
        <article className="table-card">
          <h3>{locale === "ru" ? "Кард турнира" : "Fight card"}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{locale === "ru" ? "Стадия" : "Stage"}</th>
                  <th>{locale === "ru" ? "Бой" : "Fight"}</th>
                  <th>{locale === "ru" ? "Вес" : "Weight"}</th>
                  <th>{locale === "ru" ? "Статус" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {event.fights.map((fight) => (
                  <tr key={fight.id}>
                    <td>{formatFightStage(fight.stage, locale)}</td>
                    <td>
                      <Link href={`/fighters/${fight.fighterA.slug}`}>{fight.fighterA.name}</Link> vs{" "}
                      <Link href={`/fighters/${fight.fighterB.slug}`}>{fight.fighterB.name}</Link>
                    </td>
                    <td>{formatWeightClass(fight.weightClass, locale)}</td>
                    <td>{formatFightStatus(fight.status, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Углы превью" : "Preview angles"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Используй этот блок для ставок, букмекерского контекста, ключевых тактических вопросов и влияния на дивизион."
                : "Use this block for stakes, betting context, key tactical questions, and divisional implications."}
            </p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "После турнира" : "After the event"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Сюда добавляются победители, методы, бонусы, медицинские отстранения и постфайт-разбор."
                : "Populate this with winners, methods, bonuses, medical suspensions, and post-fight analysis."}
            </p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанные материалы" : "Related coverage"}</h3>
            <ul>
              {relatedArticles.map((article) => (
                <li key={article.id}>
                  <Link href={`/news/${article.slug}`}>{article.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
