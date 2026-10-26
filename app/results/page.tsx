import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getResultsHubData } from "@/lib/db";
import { formatFightMethod, formatWeightClass, getDisplayName } from "@/lib/display";
import { describeFightPick, summarizeEventPicks } from "@/lib/event-picks";
import { buildResultsHub, isContenderSeries } from "@/lib/event-results";
import { formatWinnerlessFightResult, getMainEventFight, sortFightsForCard } from "@/lib/fight-card";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";

const RECENT_EVENTS = 8;

type HubEvent = Awaited<ReturnType<typeof getResultsHubData>>[number];
type HubFight = HubEvent["fights"][number];

function formatDate(date: Date, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(date);
}

function monthLabel(key: string) {
  const [year = 1970, month = 1] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\s*г\.$/, "");
}

// «Мэлотт — KO/TKO, R2 4:13»; без победителя — «Ничья»; бой ещё не прошёл — null.
function describeResult(fight: HubFight) {
  if (fight.status !== "completed") return null;
  if (!fight.winnerFighterId) return formatWinnerlessFightResult(fight.resultType, "ru");
  const winner = getDisplayName(fight.winnerFighterId === fight.fighterAId ? fight.fighterA : fight.fighterB, "ru");
  const method = fight.method ? ` — ${formatFightMethod(fight.method, "ru")}` : "";
  const round = fight.resultRound ? `, R${fight.resultRound}${fight.resultTime ? ` ${fight.resultTime}` : ""}` : "";
  return `${winner}${method}${round}`;
}

function pickMark(fight: HubFight) {
  const verdict = describeFightPick(fight)?.verdict;
  return verdict === "correct" ? "пик ✓" : verdict === "wrong" ? "пик ✗" : null;
}

function pickTally(event: HubEvent) {
  const summary = summarizeEventPicks(event.fights);
  return summary.judged > 0 ? `ИИ-модель FightBase угадала ${summary.correct} из ${summary.judged}` : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const hub = buildResultsHub(await getResultsHubData(), { recentCount: RECENT_EVENTS });
  const title = "Результаты UFC (ЮФС): итоги последнего турнира и всех боёв 2026 года";
  const description = hub.latest
    ? `Результаты UFC (ЮФС): ${hub.latest.name} (${formatDate(hub.latest.date, true)}) — победители, методы и раунды всех боёв, итоги пиков ИИ-модели FightBase. Архив результатов всех турниров 2026 года.`
    : "Результаты турниров UFC (ЮФС): победители, методы и раунды всех боёв, итоги пиков ИИ-модели FightBase.";
  const canonical = localizePath("/results", locale);
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, images: [ogImageUrl()] } };
}

export default async function ResultsPage() {
  const locale = await getLocale();
  const hub = buildResultsHub(await getResultsHubData(), { recentCount: RECENT_EVENTS });
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/results", locale), siteUrl).toString();
  const breadcrumbItems = [
    { label: "Главная", href: "/" },
    { label: "Турниры", href: "/events" },
    { label: "Результаты UFC" }
  ];
  const latest = hub.latest;
  const latestFights = latest ? sortFightsForCard(latest.fights) : [];
  const latestTally = latest ? pickTally(latest) : null;

  return (
    <main className="container">
      <JsonLd data={buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: pageUrl })} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Результаты турниров UFC",
          url: pageUrl,
          itemListElement: hub.archive
            .flatMap((month) => month.events)
            .map((event, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `${event.name}: результаты`,
              url: new URL(localizePath(`/events/${event.slug}`, locale), siteUrl).toString()
            }))
        }}
      />

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/results"
        title="Результаты UFC (ЮФС)"
        description="Итоги последнего турнира UFC по каждому бою — победитель, метод и раунд, — результаты предыдущих турниров и архив 2026 года. В ночь турнира страница обновляется по мере боёв."
      />

      <section className="stack">
        {latest ? (
          <section className="table-card editorial-card">
            <div className="ranking-table-head">
              <div className="ranking-head-copy">
                <h2>{latest.name}: результаты всех боёв</h2>
                <p className="table-note">
                  {formatDate(latest.date, true)}
                  {latestTally ? ` · ${latestTally}` : ""}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="event-card-table">
                <caption className="sr-only">Результаты турнира {latest.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Бой</th>
                    <th scope="col">Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {latestFights.map((fight) => {
                    const result = describeResult(fight);
                    const mark = pickMark(fight);
                    return (
                      <tr key={fight.id}>
                        <td>
                          <Link href={localizePath(`/fighters/${fight.fighterA.slug}`, locale)}>{getDisplayName(fight.fighterA, locale)}</Link> —{" "}
                          <Link href={localizePath(`/fighters/${fight.fighterB.slug}`, locale)}>{getDisplayName(fight.fighterB, locale)}</Link>
                          <span className="event-table-pick">
                            {fight.isMainEvent ? "Главный бой · " : ""}
                            {formatWeightClass(fight.weightClass, locale)}
                          </span>
                        </td>
                        <td>
                          <span className="event-table-result">
                            {result ? <strong>{result}</strong> : <span className="table-note">ещё не прошёл</span>}
                            {mark ? <span className="event-table-pick">{mark}</span> : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Link href={localizePath(`/events/${latest.slug}`, locale)} className="event-table-link">
              Страница турнира: кард, разборы и прогнозы →
            </Link>
          </section>
        ) : (
          <section className="filter-empty-state">
            <p className="copy">Результатов прошедших турниров пока нет.</p>
          </section>
        )}

        {hub.recent.length > 0 ? (
          <section className="stack">
            <h2>Результаты предыдущих турниров</h2>
            <div className="champions-grid">
              {hub.recent.map((event) => {
                const main = getMainEventFight(event.fights);
                const mainResult = main ? describeResult(main) : null;
                const tally = pickTally(event);
                return (
                  <section key={event.slug} className="policy-card champion-card">
                    <h3>{event.name}</h3>
                    <p className="table-note">{formatDate(event.date, true)}</p>
                    {main && mainResult ? (
                      <p className="copy">
                        Главный бой: {getDisplayName(main.fighterA, locale)} — {getDisplayName(main.fighterB, locale)}. Победа: <strong>{mainResult}</strong>
                      </p>
                    ) : null}
                    {tally ? <p className="table-note">{tally}</p> : null}
                    <Link href={localizePath(`/events/${event.slug}`, locale)} className="event-table-link">
                      Все результаты турнира →
                    </Link>
                  </section>
                );
              })}
            </div>
          </section>
        ) : null}

        {hub.archive.length > 0 ? (
          <section className="policy-card">
            <h2>Архив результатов UFC 2026</h2>
            {hub.archive.map((month) => (
              <div key={month.key}>
                <h3>{monthLabel(month.key)}</h3>
                <ul className="event-side-list">
                  {month.events.map((event) => (
                    <li key={event.slug}>
                      <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>{" "}
                      <span className="table-note">
                        {formatDate(event.date)}
                        {isContenderSeries(event.name) ? " · Contender Series" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        <p className="table-note">
          <Link href={localizePath("/events", locale)}>Расписание ближайших турниров UFC</Link> ·{" "}
          <Link href={localizePath("/predictions/accuracy", locale)}>история точности ИИ-модели FightBase</Link>
        </p>
      </section>
    </main>
  );
}
