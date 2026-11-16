import Link from "next/link";

import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";
import { barHeightPercent, shortEventLabel } from "@/lib/prediction-chart";

type Tally = { correct: number; judged: number; percent: number | null };

export type PredictionStatsData = {
  eventsCount: number;
  events: Array<{ slug: string; name: string; date: Date | string; model: Tally; favorite: Tally }>;
  model: Tally;
  favorite: Tally;
  modelRoi: { units: number; staked: number; percent: number | null };
  favoriteRoi: { percent: number | null };
};

// Панель точности на странице прогнозов: главная цифра, сравнение с фаворитом,
// столбики по последним турнирам и результат плоской ставки. Заменила пять
// абзацев текста с теми же числами (16.11.2026).
export function PredictionStatsPanel({
  locale,
  accuracy,
  sinceNote
}: {
  locale: Locale;
  accuracy: PredictionStatsData;
  sinceNote?: string | null;
}) {
  if (accuracy.model.percent === null) return null;

  const dateLocale = locale === "ru" ? "ru-RU" : "en-US";
  const chartEvents = accuracy.events
    .filter((event) => event.model.judged > 0 || event.favorite.judged > 0)
    .map((event) => ({
      ...event,
      label: shortEventLabel(event.name),
      dateLabel: new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(event.date)),
      modelHeight: barHeightPercent(event.model),
      favoriteHeight: barHeightPercent(event.favorite)
    }));
  const signedPercent = (value: number) => `${value > 0 ? "+" : ""}${value}%`;
  const bankrollUnits = accuracy.modelRoi.units;
  const bankrollNumber = Math.abs(bankrollUnits).toFixed(2);
  const bankrollLabel = `${bankrollUnits > 0 ? "+" : bankrollUnits < 0 ? "−" : ""}${locale === "ru" ? bankrollNumber.replace(".", ",") : bankrollNumber}`;
  return (
    <>
      <section className="pstats" aria-label={locale === "ru" ? "Точность прогнозов" : "Prediction track record"}>
        <div className="pstats-main">
          <p className="pstats-label">{locale === "ru" ? "Точность модели" : "Model accuracy"}</p>
          <p className="pstats-hero">
            <strong>{accuracy.model.percent}%</strong>
            <span>
              {locale === "ru"
                ? `${accuracy.model.correct} из ${accuracy.model.judged} боёв угадано`
                : `${accuracy.model.correct} of ${accuracy.model.judged} bouts called`}
            </span>
          </p>
          <p className="pstats-hint">
            {locale === "ru" ? `на последних турнирах: ${accuracy.eventsCount}` : `across the last ${accuracy.eventsCount} events`}
          </p>
          <div className="pstats-versus">
            <div className="pstats-versus-row">
              <span>
                <i className="pstats-dot pstats-dot--model" aria-hidden="true" />
                {locale === "ru" ? "Модель FightBase" : "FightBase model"}
              </span>
              <b>{accuracy.model.percent}%</b>
              <div className="pstats-track">
                <i className="pstats-fill pstats-fill--model" style={{ width: `${accuracy.model.percent}%` }} />
              </div>
            </div>
            {accuracy.favorite.percent !== null ? (
              <div className="pstats-versus-row">
                <span>
                  <i className="pstats-dot pstats-dot--fav" aria-hidden="true" />
                  {locale === "ru" ? "Фаворит по линии" : "The favorite"}
                </span>
                <b>{accuracy.favorite.percent}%</b>
                <div className="pstats-track">
                  <i className="pstats-fill pstats-fill--fav" style={{ width: `${accuracy.favorite.percent}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {chartEvents.length >= 2 ? (
          <div className="pstats-chart-col">
            <div className="pstats-chart-head">
              <p className="pstats-label">{locale === "ru" ? "По турнирам" : "By event"}</p>
              <p className="pstats-legend">
                <span>
                  <i className="pstats-dot pstats-dot--model" aria-hidden="true" />
                  {locale === "ru" ? "Модель" : "Model"}
                </span>
                <span>
                  <i className="pstats-dot pstats-dot--fav" aria-hidden="true" />
                  {locale === "ru" ? "Фаворит" : "Favorite"}
                </span>
              </p>
            </div>
            <div
              className="pstats-chart"
              style={{ gridTemplateColumns: `repeat(${chartEvents.length}, minmax(0, 1fr))` }}
              role="img"
              aria-label={
                locale === "ru"
                  ? `Доля угаданных боёв по турнирам: ${chartEvents.map((event) => `${event.label} — модель ${event.model.correct} из ${event.model.judged}, фаворит ${event.favorite.correct} из ${event.favorite.judged}`).join("; ")}`
                  : `Share of bouts called by event: ${chartEvents.map((event) => `${event.label} — model ${event.model.correct} of ${event.model.judged}, favorite ${event.favorite.correct} of ${event.favorite.judged}`).join("; ")}`
              }
            >
              <span className="pstats-axis pstats-axis--100">100%</span>
              <span className="pstats-axis pstats-axis--50">50%</span>
              {chartEvents.map((event) => (
                <div className="pstats-group" key={event.slug} tabIndex={0}>
                  {event.modelHeight !== null ? (
                    <div className="pstats-bar pstats-bar--model" style={{ height: `${event.modelHeight}%` }}>
                      <em>
                        {event.model.correct}/{event.model.judged}
                      </em>
                    </div>
                  ) : null}
                  {event.favoriteHeight !== null ? (
                    <div className="pstats-bar pstats-bar--fav" style={{ height: `${event.favoriteHeight}%` }} />
                  ) : null}
                  <div className="pstats-tip">
                    <b>
                      {event.label}, {event.dateLabel}
                    </b>
                    <span>
                      <i className="pstats-dot pstats-dot--model" aria-hidden="true" />
                      {locale === "ru" ? "Модель" : "Model"}: {event.model.correct} {locale === "ru" ? "из" : "of"} {event.model.judged}
                      {event.model.percent !== null ? ` (${event.model.percent}%)` : ""}
                    </span>
                    <span>
                      <i className="pstats-dot pstats-dot--fav" aria-hidden="true" />
                      {locale === "ru" ? "Фаворит" : "Favorite"}: {event.favorite.correct} {locale === "ru" ? "из" : "of"} {event.favorite.judged}
                      {event.favorite.percent !== null ? ` (${event.favorite.percent}%)` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pstats-xlabels" style={{ gridTemplateColumns: `repeat(${chartEvents.length}, minmax(0, 1fr))` }} aria-hidden="true">
              {chartEvents.map((event) => (
                <span key={event.slug}>
                  <b>{event.label}</b>
                  {event.dateLabel}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {accuracy.modelRoi.percent !== null ? (
          <div className="pstats-bank">
            <p className="pstats-label">{locale === "ru" ? "Если ставить по 1 у.е." : "Staking 1 unit a pick"}</p>
            <strong className={accuracy.modelRoi.units > 0 ? "is-up" : undefined}>{bankrollLabel}</strong>
            <p>
              {locale === "ru"
                ? `на прогнозах модели: ${accuracy.modelRoi.staked}`
                : `across ${accuracy.modelRoi.staked} model picks`}
            </p>
            <dl>
              <dt>
                <i className="pstats-dot pstats-dot--model" aria-hidden="true" />
                {locale === "ru" ? "Модель, ROI" : "Model ROI"}
              </dt>
              <dd>{signedPercent(accuracy.modelRoi.percent)}</dd>
              {accuracy.favoriteRoi.percent !== null ? (
                <>
                  <dt>
                    <i className="pstats-dot pstats-dot--fav" aria-hidden="true" />
                    {locale === "ru" ? "Всегда фаворит" : "Always the favorite"}
                  </dt>
                  <dd>{signedPercent(accuracy.favoriteRoi.percent)}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
      </section>
      <p className="pstats-foot">
        <span>
          {sinceNote ? `${sinceNote} ` : ""}
          {locale === "ru" ? "Прогноз — не совет делать ставки." : "A pick is not betting advice."}
        </span>
        <Link href={localizePath("/predictions/accuracy", locale)}>
          {locale === "ru" ? "Вся история точности по турнирам →" : "Full accuracy history by event →"}
        </Link>
      </p>
    </>
  );
}
