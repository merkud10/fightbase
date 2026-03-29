import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import { getFighterPageData } from "@/lib/db";
import { formatFightStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";

export default async function FighterPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getFighterPageData(slug);

  if (!data) {
    notFound();
  }

  const { fighter, recentFights, relatedArticles } = data;

  return (
    <main className="container">
      <PageHero
        eyebrow={`/fighters/${fighter.slug}`}
        title={fighter.name}
        description={`${fighter.record} - ${formatWeightClass(fighter.weightClass, locale)} - ${fighter.style} - ${fighter.team}`}
      />

      <section className="detail-grid">
        <article className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Краткий профиль" : "Profile summary"}</h3>
            <p className="copy">{fighter.bio}</p>
          </div>
          <div className="table-card">
            <h3>{locale === "ru" ? "Последние бои" : "Recent fights"}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{locale === "ru" ? "Турнир" : "Event"}</th>
                    <th>{locale === "ru" ? "Вес" : "Weight"}</th>
                    <th>{locale === "ru" ? "Статус" : "Status"}</th>
                    <th>{locale === "ru" ? "Итог" : "Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFights.map((fight) => (
                    <tr key={fight.id}>
                      <td>{fight.event.name}</td>
                      <td>{formatWeightClass(fight.weightClass, locale)}</td>
                      <td>{formatFightStatus(fight.status, locale)}</td>
                      <td>
                        {fight.method && fight.resultRound
                          ? `${fight.method} R${fight.resultRound}`
                          : locale === "ru"
                            ? "Назначен"
                            : "Scheduled"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Параметры" : "Vitals"}</h3>
            <p className="copy">
              {locale === "ru" ? "Возраст" : "Age"} {fighter.age} - {fighter.heightCm} cm -{" "}
              {locale === "ru" ? `${fighter.reachCm} cm размах` : `${fighter.reachCm} cm reach`}
            </p>
            <p className="copy">{fighter.country}</p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Точки таймлайна" : "Timeline hooks"}</h3>
            <div className="stack">
              <div className="timeline-item">{locale === "ru" ? "Анонс боя" : "Fight announcement"}</div>
              <div className="timeline-item">{locale === "ru" ? "Медиа-день" : "Media day"}</div>
              <div className="timeline-item">{locale === "ru" ? "Взвешивание" : "Weigh-ins"}</div>
              <div className="timeline-item">{locale === "ru" ? "Ночь боя" : "Fight night"}</div>
              <div className="timeline-item">{locale === "ru" ? "Постфайт-реакция" : "Post-fight reaction"}</div>
            </div>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанные материалы" : "Related stories"}</h3>
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
