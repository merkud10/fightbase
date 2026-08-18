import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHero } from "@/components/page-hero";
import { getPredictionAccuracyHistory } from "@/lib/db";
import { emptyRoiBucket, formatUnits, roiPercent, type RoiBucket } from "@/lib/prediction-roi";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/predictions/accuracy",
    title: locale === "ru" ? "Точность прогнозов FightBase" : "FightBase prediction accuracy",
    description:
      locale === "ru"
        ? "Открытая история точности прогнозов FightBase по турнирам UFC: пики модели, результаты фаворитов и угаданные апсеты по каждому бою."
        : "The full FightBase prediction track record by UFC event: model picks, favorite results, and called upsets for every bout."
  });
}

type Bucket = { correct: number; judged: number };

function percentOf(bucket: Bucket) {
  return bucket.judged > 0 ? Math.round((bucket.correct / bucket.judged) * 100) : null;
}

function formatScore(bucket: Bucket, locale: "ru" | "en") {
  if (bucket.judged === 0) {
    return locale === "ru" ? "нет оценённых боёв" : "no scored bouts";
  }

  const percent = percentOf(bucket);
  return locale === "ru"
    ? `${bucket.correct} из ${bucket.judged} (${percent}%)`
    : `${bucket.correct} of ${bucket.judged} (${percent}%)`;
}

export default async function PredictionAccuracyPage() {
  const locale = await getLocale();
  const history = await getPredictionAccuracyHistory();

  const totalModel: Bucket = { correct: 0, judged: 0 };
  const totalFavorite: Bucket = { correct: 0, judged: 0 };
  const totalModelRoi: RoiBucket = emptyRoiBucket();
  const totalFavoriteRoi: RoiBucket = emptyRoiBucket();
  let totalUpsetsCalled = 0;

  for (const event of history) {
    totalModel.correct += event.model.correct;
    totalModel.judged += event.model.judged;
    totalFavorite.correct += event.favorite.correct;
    totalFavorite.judged += event.favorite.judged;
    totalModelRoi.staked += event.modelRoi.staked;
    totalModelRoi.units += event.modelRoi.units;
    totalFavoriteRoi.staked += event.favoriteRoi.staked;
    totalFavoriteRoi.units += event.favoriteRoi.units;
    totalUpsetsCalled += event.fights.filter(
      (fight) => fight.modelVerdict === "correct" && fight.favoriteVerdict === "wrong"
    ).length;
  }

  const formatRoiLine = (roi: RoiBucket) => {
    const percent = roiPercent(roi);
    if (percent === null) {
      return locale === "ru" ? "нет данных" : "no data";
    }
    return locale === "ru"
      ? `${formatUnits(roi.units, "ru")} на ${roi.staked} прогнозах (ROI ${percent > 0 ? "+" : ""}${percent}%)`
      : `${formatUnits(roi.units, "en")} across ${roi.staked} picks (ROI ${percent > 0 ? "+" : ""}${percent}%)`;
  };

  const displayName = (fighter: { name: string; nameRu: string | null }) =>
    (locale === "ru" ? fighter.nameRu : null) ?? fighter.name;

  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions", href: "/predictions" },
    { label: locale === "ru" ? "Точность" : "Accuracy" }
  ];

  return (
    <main className="container">
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/predictions/accuracy"
        title={locale === "ru" ? "Точность прогнозов FightBase" : "FightBase prediction accuracy"}
        description={
          locale === "ru"
            ? "Открытая статистика: перед каждым турниром пики фиксируются в снапшоте и после боёв сверяются с результатами. Здесь вся история — включая промахи."
            : "An open track record: picks are locked in a snapshot before each event and checked against the results. The full history lives here — misses included."
        }
      />

      {history.length === 0 ? (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "История пока пуста" : "No history yet"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Первые итоги появятся после ближайшего завершённого турнира: прогнозы уже зафиксированы, после боёв здесь появится разбор каждого пика."
              : "The first results will appear after the next completed event: picks are already locked, and every one will be scored here after the fights."}
          </p>
          <p className="copy">
            <Link href={localizePath("/predictions", locale)}>
              {locale === "ru" ? "Смотреть текущие прогнозы →" : "See current predictions →"}
            </Link>
          </p>
        </section>
      ) : (
        <>
          <section className="policy-card" aria-label={locale === "ru" ? "Сводка за всё время" : "All-time summary"}>
            <p className="kicker">{locale === "ru" ? "За всё время" : "All time"}</p>
            <p className="copy">
              {locale === "ru"
                ? `Прогноз FightBase: ${formatScore(totalModel, locale)} · Фаворит по предматчевой оценке: ${formatScore(totalFavorite, locale)} · Угаданных апсетов: ${totalUpsetsCalled}`
                : `FightBase pick: ${formatScore(totalModel, locale)} · Pre-fight favorite: ${formatScore(totalFavorite, locale)} · Upsets called: ${totalUpsetsCalled}`}
            </p>
            <p className="copy">
              {locale === "ru"
                ? `Виртуальный банкролл (1 у.е. на каждый прогноз): ${formatRoiLine(totalModelRoi)} · Стратегия «всегда фаворит»: ${formatRoiLine(totalFavoriteRoi)}`
                : `Virtual bankroll (1 unit per pick): ${formatRoiLine(totalModelRoi)} · "Always the favorite" strategy: ${formatRoiLine(totalFavoriteRoi)}`}
            </p>
            <p className="copy">
              {locale === "ru"
                ? "Ничьи, No Contest и отменённые бои в статистику не входят. Расчёт по кэфам на момент фиксации прогноза, в условных единицах; это открытая проверка модели, а не рекомендация."
                : "Draws, No Contests, and cancelled bouts are excluded. Units are virtual, priced at pick-time odds; this is an open model audit, not advice."}
            </p>
          </section>

          <section className="stack predictions-stack">
            {history.map((event) => (
              <article key={event.id} className="table-card">
                <div className="event-detail-head">
                  <div>
                    <p className="kicker">
                      {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}
                    </p>
                    <h3>
                      <Link href={localizePath(`/events/${event.slug}`, locale)} className="event-table-link">
                        {event.name}
                      </Link>
                    </h3>
                    <p className="copy">
                      {locale === "ru"
                        ? `Прогноз FightBase: ${formatScore(event.model, locale)} · Фаворит: ${formatScore(event.favorite, locale)}`
                        : `FightBase pick: ${formatScore(event.model, locale)} · Favorite: ${formatScore(event.favorite, locale)}`}
                    </p>
                    {event.modelRoi.staked > 0 ? (
                      <p className="copy">
                        {locale === "ru"
                          ? `Банкролл: ${formatRoiLine(event.modelRoi)} · «Всегда фаворит»: ${formatRoiLine(event.favoriteRoi)}`
                          : `Bankroll: ${formatRoiLine(event.modelRoi)} · "Always the favorite": ${formatRoiLine(event.favoriteRoi)}`}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      {locale === "ru"
                        ? `Точность прогнозов на турнире ${event.name}`
                        : `Prediction accuracy at ${event.name}`}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{locale === "ru" ? "Бой" : "Fight"}</th>
                        <th scope="col">{locale === "ru" ? "Прогноз FightBase" : "FightBase pick"}</th>
                        <th scope="col">{locale === "ru" ? "Итог" : "Result"}</th>
                        <th scope="col">{locale === "ru" ? "Оценка" : "Verdict"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.fights.map((fight) => (
                        <tr key={fight.id}>
                          <td>
                            {fight.slug ? (
                              <Link
                                href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
                                className="event-table-link"
                              >
                                {displayName(fight.fighterA)} vs {displayName(fight.fighterB)}
                              </Link>
                            ) : (
                              <>
                                {displayName(fight.fighterA)} vs {displayName(fight.fighterB)}
                              </>
                            )}
                          </td>
                          <td>
                            {fight.pickFighter ? (
                              <>
                                {displayName(fight.pickFighter)}
                                {fight.pickAgainstOdds
                                  ? ` (${locale === "ru" ? "против котировок" : "against the odds"})`
                                  : ""}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {fight.winnerFighter
                              ? displayName(fight.winnerFighter)
                              : fight.resultType === "draw"
                                ? locale === "ru"
                                  ? "Ничья"
                                  : "Draw"
                                : fight.resultType === "no_contest"
                                  ? "No Contest"
                                  : "—"}
                          </td>
                          <td>
                            {fight.modelVerdict === "correct" && fight.favoriteVerdict === "wrong"
                              ? locale === "ru"
                                ? "✓✓ угадан апсет"
                                : "✓✓ upset called"
                              : fight.modelVerdict === "correct"
                                ? "✓"
                                : fight.modelVerdict === "wrong"
                                  ? "✗"
                                  : locale === "ru"
                                    ? "не засчитано"
                                    : "not scored"}
                            {fight.pickUnits !== null
                              ? ` · ${formatUnits(fight.pickUnits, locale === "ru" ? "ru" : "en")}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
