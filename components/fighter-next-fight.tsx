import Link from "next/link";

import { MetrikaInternalLink } from "@/components/metrika-goal-link";
import { localizePath } from "@/lib/locale-path";
import { findRankingDivision } from "@/lib/ranking-divisions";

type Locale = "ru" | "en";

export type FighterNextFightProps = {
  locale: Locale;
  opponent: { name: string; slug: string; record?: string | null };
  dateLabel: string;
  event: { name: string; slug: string };
  /** Адрес страницы прогноза; null, пока снапшота для боя нет. */
  predictionPath: string | null;
};

// Карточка бойца — главный вход из Google (35% переходов в ноябре 2026), и 85%
// таких посетителей уходили с первой страницы: следующий бой стоял одной серой
// строкой, где ссылка на прогноз не отличалась от текста. Здесь это отдельный
// блок с соперником в заголовке и ссылкой-действием.
export function FighterNextFight({ locale, opponent, dateLabel, event, predictionPath }: FighterNextFightProps) {
  const ru = locale === "ru";
  const eventHref = localizePath(`/events/${event.slug}`, locale);
  return (
    <section className="fighter-next" aria-label={ru ? "Следующий бой" : "Next fight"}>
      <p className="kicker">{ru ? "Следующий бой" : "Next fight"}</p>
      <p className="fighter-next-title">
        {/* «vs», а не «против»: склонять имена нечем, а «против Карлос Улберг» — ошибка. */}
        <span className="fighter-next-vs">vs</span>{" "}
        <Link href={localizePath(`/fighters/${opponent.slug}`, locale)}>{opponent.name}</Link>
        {opponent.record ? <span className="fighter-next-record"> {opponent.record}</span> : null}
      </p>
      <p className="fighter-next-meta">
        {dateLabel} · <Link href={eventHref}>{event.name}</Link>
      </p>
      <p className="fighter-next-actions">
        {predictionPath ? (
          <MetrikaInternalLink href={localizePath(predictionPath, locale)} goal="fighter_prediction_click" className="action-link">
            {ru ? "Разбор и прогноз на бой →" : "Breakdown and prediction →"}
          </MetrikaInternalLink>
        ) : null}
        <MetrikaInternalLink href={eventHref} goal="fighter_event_click" className={predictionPath ? "fighter-next-secondary" : "action-link"}>
          {ru ? "Весь кард и время по Москве" : "Full card and start times"}
        </MetrikaInternalLink>
      </p>
    </section>
  );
}

// У бойца без назначенного боя страница заканчивалась списком прошлых боёв.
// Даём продолжение: рейтинг его веса, расписание и прогнозы ближайшего турнира.
export function FighterWhereNext({ locale, weightClass }: { locale: Locale; weightClass: string }) {
  const ru = locale === "ru";
  const division = findRankingDivision(weightClass);
  return (
    <section className="fighter-where-next" aria-label={ru ? "Что ещё посмотреть" : "Where next"}>
      <h3>{ru ? "Что ещё посмотреть" : "Where next"}</h3>
      <ul>
        {division ? (
          <li>
            <Link href={localizePath(`/rankings/${division.slug}`, locale)}>
              {ru ? `Рейтинг UFC ${division.ruIn}` : `UFC ${division.enTitle} rankings`}
            </Link>
          </li>
        ) : null}
        <li>
          <Link href={localizePath("/predictions", locale)}>{ru ? "Прогнозы на ближайший турнир UFC" : "Predictions for the next UFC event"}</Link>
        </li>
        <li>
          <Link href={localizePath("/events", locale)}>{ru ? "Расписание турниров UFC" : "UFC schedule"}</Link>
        </li>
      </ul>
    </section>
  );
}

type StatRow = { label: string; value: string | number };

/** Строки статистики только с известными значениями: у новичков блок был из двенадцати прочерков. */
export function buildFighterStatRows(
  fighter: {
    sigStrikesLandedPerMin: number | null;
    strikeAccuracy: number | null;
    sigStrikesAbsorbedPerMin: number | null;
    strikeDefense: number | null;
    takedownAveragePer15: number | null;
    takedownAccuracy: number | null;
    takedownDefense: number | null;
    submissionAveragePer15: number | null;
    winsByKnockout: number | null;
    winsBySubmission: number | null;
    winsByDecision: number | null;
    averageFightTime: string | null;
  },
  locale: Locale
): StatRow[] {
  const ru = locale === "ru";
  const percent = (value: number | null) => (value != null ? `${value}%` : null);
  const rows: [string, string | number | null][] = [
    ["SLpM", fighter.sigStrikesLandedPerMin],
    [ru ? "Точность ударов" : "Strike accuracy", percent(fighter.strikeAccuracy)],
    ["SApM", fighter.sigStrikesAbsorbedPerMin],
    [ru ? "Защита в стойке" : "Strike defense", percent(fighter.strikeDefense)],
    [ru ? "Тейкдауны / 15 мин" : "TD avg / 15 min", fighter.takedownAveragePer15],
    [ru ? "Точность тейкдаунов" : "TD accuracy", percent(fighter.takedownAccuracy)],
    [ru ? "Защита от тейкдаунов" : "TD defense", percent(fighter.takedownDefense)],
    [ru ? "Сабмишены / 15 мин" : "Sub avg / 15 min", fighter.submissionAveragePer15],
    [ru ? "Побед KO/TKO" : "Wins by KO/TKO", fighter.winsByKnockout],
    [ru ? "Побед сабмишеном" : "Wins by submission", fighter.winsBySubmission],
    [ru ? "Побед решением" : "Wins by decision", fighter.winsByDecision],
    [ru ? "Среднее время боя" : "Average fight time", fighter.averageFightTime || null]
  ];
  return rows.filter((row): row is [string, string | number] => row[1] != null).map(([label, value]) => ({ label, value }));
}
