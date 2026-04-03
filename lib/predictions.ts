import type { Locale } from "@/lib/locale-config";

export type FighterPredictionData = {
  id: string;
  slug: string;
  name: string;
  nameRu?: string | null;
  record: string | null;
  status: string;
  sigStrikesLandedPerMin: number | null;
  strikeAccuracy: number | null;
  strikeDefense: number | null;
  takedownAveragePer15: number | null;
  takedownAccuracy: number | null;
  takedownDefense: number | null;
  submissionAveragePer15: number | null;
  recentFights?: Array<{
    result: string;
    opponentName: string;
    date: Date;
    method?: string | null;
  }>;
};

export type FightOddsContext = {
  oddsA: number | null;
  oddsB: number | null;
};

function parseRecord(record: string | null | undefined) {
  const match = String(record || "").match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0 };
  }

  return {
    wins: Number(match[1]),
    losses: Number(match[2]),
    draws: Number(match[3] || 0)
  };
}

/** Implied win probabilities from decimal odds, vig removed by normalizing. */
export function getImpliedWinProbabilities(
  oddsA: number | null | undefined,
  oddsB: number | null | undefined
): { pA: number; pB: number } | null {
  if (oddsA == null || oddsB == null || oddsA <= 1 || oddsB <= 1) {
    return null;
  }

  const invA = 1 / oddsA;
  const invB = 1 / oddsB;
  const sum = invA + invB;
  if (sum <= 0) {
    return null;
  }

  return { pA: invA / sum, pB: invB / sum };
}

/** Heuristic score for matchup when bookmaker odds are unavailable. */
export function getHeuristicPredictionScore(fighter: FighterPredictionData): number {
  const parsed = parseRecord(fighter.record);
  const totalFights = parsed.wins + parsed.losses + parsed.draws;
  const winRate = totalFights > 0 ? parsed.wins / totalFights : 0.45;

  let score = 18 + winRate * 52;

  const recent = (fighter.recentFights || []).slice(0, 3);
  const recentWins = recent.filter((f) => /побед|win/i.test(f.result)).length;
  score += recentWins * 5;

  if (fighter.status === "champion") {
    score += 8;
  } else if (fighter.status === "prospect") {
    score += 3;
  }

  const hasUfcStats =
    fighter.sigStrikesLandedPerMin != null ||
    fighter.takedownAveragePer15 != null ||
    fighter.strikeAccuracy != null;

  if (hasUfcStats) {
    score += (fighter.sigStrikesLandedPerMin ?? 0) * 1.5;
    score += (fighter.strikeAccuracy ?? 0) * 0.06;
    score += (fighter.strikeDefense ?? 0) * 0.05;
    score += (fighter.takedownAveragePer15 ?? 0) * 2.2;
    score += (fighter.takedownDefense ?? 0) * 0.05;
    score += (fighter.submissionAveragePer15 ?? 0) * 3;
  }

  return score;
}

/** @deprecated Prefer getFightWinPercentages + getHeuristicPredictionScore */
export function getPredictionScore(fighter: FighterPredictionData) {
  return getHeuristicPredictionScore(fighter);
}

export function getFightWinPercentages(
  fighterA: FighterPredictionData,
  fighterB: FighterPredictionData,
  odds?: FightOddsContext | null
): { percentA: number; percentB: number; source: "odds" | "heuristic" } {
  const implied = odds && getImpliedWinProbabilities(odds.oddsA, odds.oddsB);
  if (implied) {
    return {
      percentA: Math.round(implied.pA * 100),
      percentB: Math.round(implied.pB * 100),
      source: "odds"
    };
  }

  const sA = getHeuristicPredictionScore(fighterA);
  const sB = getHeuristicPredictionScore(fighterB);
  const total = Math.max(sA + sB, 0.001);
  return {
    percentA: Math.round((sA / total) * 100),
    percentB: Math.round((sB / total) * 100),
    source: "heuristic"
  };
}

import { getDisplayName } from "@/lib/display";
export { getDisplayName };

export function fighterHasComparableStats(fighter: FighterPredictionData): boolean {
  return (
    fighter.sigStrikesLandedPerMin != null ||
    fighter.strikeAccuracy != null ||
    fighter.strikeDefense != null ||
    fighter.takedownAveragePer15 != null ||
    fighter.takedownDefense != null
  );
}

function formatPercent(value: number | null | undefined) {
  return value == null ? null : `${Math.round(value)}%`;
}

function summarizeRecentForm(fighter: FighterPredictionData, locale: Locale) {
  const recent = (fighter.recentFights || []).slice(0, 3);
  if (recent.length === 0) {
    return locale === "ru"
      ? "В базе мало данных по недавним выступлениям."
      : "Recent form is thin in the local database.";
  }

  const wins = recent.filter((fight) => /побед|win/i.test(fight.result)).length;
  const losses = recent.filter((fight) => /поражен|loss/i.test(fight.result)).length;
  const latest = recent[0]!;

  if (locale === "ru") {
    return `${getDisplayName(fighter, locale)}: в последних ${recent.length} боях по базе ${wins}-${losses}. Последний соперник: ${latest.opponentName}.`;
  }

  return `${getDisplayName(fighter, locale)} is ${wins}-${losses} across the last ${recent.length} logged fights. Latest opponent: ${latest.opponentName}.`;
}

function compareMetric(
  labelRu: string,
  labelEn: string,
  left: number | null | undefined,
  right: number | null | undefined,
  locale: Locale,
  formatter: (value: number | null | undefined) => string | null = (value) => (value == null ? null : value.toFixed(2))
) {
  if (left == null && right == null) {
    return null;
  }

  const leftValue = formatter(left) ?? "—";
  const rightValue = formatter(right) ?? "—";

  return locale === "ru" ? `${labelRu}: ${leftValue} — ${rightValue}` : `${labelEn}: ${leftValue} vs ${rightValue}`;
}

function buildPathsToVictory(locale: Locale, fighterA: FighterPredictionData, fighterB: FighterPredictionData) {
  const fighterAName = getDisplayName(fighterA, locale);
  const fighterBName = getDisplayName(fighterB, locale);

  const aPressure = (fighterA.sigStrikesLandedPerMin ?? 0) > (fighterB.sigStrikesLandedPerMin ?? 0);
  const aWrestling = (fighterA.takedownAveragePer15 ?? 0) > (fighterB.takedownAveragePer15 ?? 0);
  const bSubThreat = (fighterB.submissionAveragePer15 ?? 0) > (fighterA.submissionAveragePer15 ?? 0);

  return {
    fighterA:
      locale === "ru"
        ? `${fighterAName}: ${aPressure ? "плюс в объёме ударов" : "нужно ловить темп и дистанцию"}${aWrestling ? ", есть угроза переводов" : ""}.`
        : `${fighterAName}: ${aPressure ? "volume edge on the feet" : "needs rhythm and distance"}${aWrestling ? ", takedown threat" : ""}.`,
    fighterB:
      locale === "ru"
        ? `${fighterBName}: ${bSubThreat ? "сильнее в борьбе/сабах" : "ищет тяжёлые размены и контрпики"}.`
        : `${fighterBName}: ${bSubThreat ? "grappling/sub threat" : "heavy exchanges and counters"}.`
  };
}

export function buildPredictionCopy(
  locale: Locale,
  fighterA: FighterPredictionData,
  fighterB: FighterPredictionData,
  options?: FightOddsContext | null
) {
  const oddsCtx = options?.oddsA != null && options?.oddsB != null ? options : null;
  const implied = oddsCtx ? getImpliedWinProbabilities(oddsCtx.oddsA, oddsCtx.oddsB) : null;

  const scoreA = getHeuristicPredictionScore(fighterA);
  const scoreB = getHeuristicPredictionScore(fighterB);
  let favorite = scoreA >= scoreB ? fighterA : fighterB;
  let underdog = favorite.id === fighterA.id ? fighterB : fighterA;

  if (implied) {
    favorite = implied.pA >= implied.pB ? fighterA : fighterB;
    underdog = favorite.id === fighterA.id ? fighterB : fighterA;
  }

  const favoriteName = getDisplayName(favorite, locale);
  const underdogName = getDisplayName(underdog, locale);
  const margin = Math.abs(scoreA - scoreB);
  const impliedMargin = implied ? Math.abs(implied.pA - implied.pB) : 0;

  const confidenceLabel =
    implied && impliedMargin > 0.18
      ? locale === "ru"
        ? "явный фаворит по линии"
        : "clear favorite by the odds"
      : implied && impliedMargin > 0.08
        ? locale === "ru"
          ? "умеренный фаворит по линии"
          : "moderate favorite by the odds"
        : implied
          ? locale === "ru"
            ? "примерно равные шансы по линии"
            : "close odds"
          : margin > 18
            ? locale === "ru"
              ? "преимущество по профилю"
              : "clear edge on paper"
            : margin > 8
              ? locale === "ru"
                ? "небольшое преимущество"
                : "slight edge"
              : locale === "ru"
                ? "равный матчап"
                : "toss-up";

  const statLines = [
    compareMetric("SLpM", "SLpM", fighterA.sigStrikesLandedPerMin, fighterB.sigStrikesLandedPerMin, locale),
    compareMetric("Точность ударов", "Strike accuracy", fighterA.strikeAccuracy, fighterB.strikeAccuracy, locale, formatPercent),
    compareMetric("Защита в стойке", "Strike defense", fighterA.strikeDefense, fighterB.strikeDefense, locale, formatPercent),
    compareMetric("TD avg", "TD avg", fighterA.takedownAveragePer15, fighterB.takedownAveragePer15, locale),
    compareMetric("TD defense", "TD defense", fighterA.takedownDefense, fighterB.takedownDefense, locale, formatPercent),
    compareMetric("Sub avg", "Sub avg", fighterA.submissionAveragePer15, fighterB.submissionAveragePer15, locale)
  ].filter(Boolean) as string[];

  const paths = buildPathsToVictory(locale, fighterA, fighterB);

  const overview =
    implied && oddsCtx
      ? locale === "ru"
        ? `${favoriteName} подходит к бою с небольшим преимуществом по общей картине матча. Это не гарантирует исход, и у ${underdogName} остаются рабочие пути к победе.`
        : `${favoriteName} appears to hold a slight edge in the overall matchup picture. That is not a guarantee, and ${underdogName} still has viable paths to win.`
      : locale === "ru"
        ? `${favoriteName} по нашей модели чуть выгоднее на бумаге (рекорд, форма${statLines.length ? ", доступная статистика" : ""}). У ${underdogName} всё равно есть сценарии победы.`
        : `${favoriteName} looks slightly better on paper (record, form${statLines.length ? ", available stats" : ""}). ${underdogName} still has paths to win.`;

  const keyEdge =
    implied && oddsCtx
      ? locale === "ru"
        ? `Небольшое преимущество у ${favoriteName} есть уже до старта боя, но ключевым фактором все равно остается сам матчап.`
        : `${favoriteName} may carry a slight edge before the opening bell, but the matchup itself remains the key factor.`
      : locale === "ru"
        ? `Оцениваем бой по рекорду, текущей форме и UFC-статистике, где она заполнена.`
        : `We evaluate the fight through record, current form, and UFC stats where available.`;

  const fightScript =
    locale === "ru"
      ? `Ключ — кто навяжет темп и дистанцию. ${favoriteName} логичнее тянуть бой в привычный ритм; ${underdogName} выигрывает срывами, контрпиками и силовыми эпизодами.`
      : `Whoever imposes pace and range shapes the fight. ${favoriteName} likely wants their rhythm; ${underdogName} needs disruption and big moments.`;

  const pick =
    implied && oddsCtx
      ? locale === "ru"
        ? favoriteName
        : favoriteName
      : locale === "ru"
        ? favoriteName
        : favoriteName;

  return {
    favorite,
    confidenceLabel,
    overview,
    keyEdge,
    fightScript,
    pick,
    formA: summarizeRecentForm(fighterA, locale),
    formB: summarizeRecentForm(fighterB, locale),
    pathA: paths.fighterA,
    pathB: paths.fighterB,
    statLines,
    hasOdds: Boolean(implied && oddsCtx)
  };
}
