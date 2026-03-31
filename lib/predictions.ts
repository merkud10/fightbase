type Locale = "ru" | "en";

type FighterPredictionData = {
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

export function getPredictionScore(
  fighter: Omit<FighterPredictionData, "id" | "slug" | "name" | "nameRu" | "recentFights">
) {
  const parsed = parseRecord(fighter.record);
  const total = parsed.wins + parsed.losses + parsed.draws;
  const winRate = total > 0 ? parsed.wins / total : 0;

  return (
    winRate * 50 +
    (fighter.status === "champion" ? 8 : fighter.status === "prospect" ? 3 : 0) +
    (fighter.sigStrikesLandedPerMin ?? 0) * 2 +
    (fighter.strikeAccuracy ?? 0) * 0.2 +
    (fighter.strikeDefense ?? 0) * 0.15 +
    (fighter.takedownAveragePer15 ?? 0) * 3 +
    (fighter.takedownAccuracy ?? 0) * 0.12 +
    (fighter.takedownDefense ?? 0) * 0.12 +
    (fighter.submissionAveragePer15 ?? 0) * 4
  );
}

export function getDisplayName(fighter: Pick<FighterPredictionData, "name" | "nameRu">, locale: Locale) {
  return locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
}

function formatPercent(value: number | null | undefined) {
  return value == null ? null : `${Math.round(value)}%`;
}

function summarizeRecentForm(fighter: FighterPredictionData, locale: Locale) {
  const recent = (fighter.recentFights || []).slice(0, 3);
  if (recent.length === 0) {
    return locale === "ru"
      ? "По последним боям в базе форма читается слабо."
      : "Recent form is thin in the local database.";
  }

  const wins = recent.filter((fight) => /побед|win/i.test(fight.result)).length;
  const losses = recent.filter((fight) => /поражен|loss/i.test(fight.result)).length;
  const latest = recent[0];

  if (locale === "ru") {
    return `${getDisplayName(fighter, locale)} идет с отрезком ${wins}-${losses} в последних ${recent.length} боях. Последний отмеченный соперник: ${latest.opponentName}.`;
  }

  return `${getDisplayName(fighter, locale)} is ${wins}-${losses} across the last ${recent.length} logged fights. Most recent listed opponent: ${latest.opponentName}.`;
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

  const leftValue = formatter(left) ?? "-";
  const rightValue = formatter(right) ?? "-";

  return locale === "ru" ? `${labelRu}: ${leftValue} против ${rightValue}` : `${labelEn}: ${leftValue} to ${rightValue}`;
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
        ? `${fighterAName} лучше всего выглядит в сценарии, где ${aPressure ? "задает темп в стойке" : "ломает ритм через смены дистанции"}${aWrestling ? " и подкрепляет это переводами" : ""}.`
        : `${fighterAName} looks best in a fight where ${aPressure ? "the striking pace is set early" : "distance and rhythm are disrupted"}${aWrestling ? " and the threat of takedowns keeps exchanges honest" : ""}.`,
    fighterB:
      locale === "ru"
        ? `${fighterBName} опаснее, если ${bSubThreat ? "доводит эпизоды до клинча и борьбы" : "сводит бой к редким, тяжелым разменам"} и заставляет соперника принимать неудобные решения.`
        : `${fighterBName} is more dangerous if ${bSubThreat ? "the fight touches clinch and grappling phases" : "the bout is reduced to fewer, heavier exchanges"} and the opponent is pushed into uncomfortable decisions.`
  };
}

export function buildPredictionCopy(locale: Locale, fighterA: FighterPredictionData, fighterB: FighterPredictionData) {
  const scoreA = getPredictionScore(fighterA);
  const scoreB = getPredictionScore(fighterB);
  const favorite = scoreA >= scoreB ? fighterA : fighterB;
  const underdog = favorite.id === fighterA.id ? fighterB : fighterA;
  const margin = Math.abs(scoreA - scoreB);
  const favoriteName = getDisplayName(favorite, locale);
  const underdogName = getDisplayName(underdog, locale);

  const confidenceLabel =
    margin > 18
      ? locale === "ru"
        ? "уверенное преимущество"
        : "clear edge"
      : margin > 8
        ? locale === "ru"
          ? "умеренное преимущество"
          : "moderate edge"
        : locale === "ru"
          ? "близкий бой"
          : "tight matchup";

  const statLines = [
    compareMetric("SLpM", "SLpM", fighterA.sigStrikesLandedPerMin, fighterB.sigStrikesLandedPerMin, locale),
    compareMetric("Точность ударов", "Strike accuracy", fighterA.strikeAccuracy, fighterB.strikeAccuracy, locale, formatPercent),
    compareMetric("Защита в стойке", "Strike defense", fighterA.strikeDefense, fighterB.strikeDefense, locale, formatPercent),
    compareMetric("TD avg", "TD avg", fighterA.takedownAveragePer15, fighterB.takedownAveragePer15, locale),
    compareMetric("TD defense", "TD defense", fighterA.takedownDefense, fighterB.takedownDefense, locale, formatPercent),
    compareMetric("Sub avg", "Sub avg", fighterA.submissionAveragePer15, fighterB.submissionAveragePer15, locale)
  ].filter(Boolean) as string[];

  const paths = buildPathsToVictory(locale, fighterA, fighterB);

  return {
    favorite,
    confidenceLabel,
    overview:
      locale === "ru"
        ? `${favoriteName} подходит к этому матчапу с более устойчивой статистической базой. Рекорд, рабочий объем и защитные метрики дают ему ${confidenceLabel}, но окно для ответа у ${underdogName} остается, если бой уйдет в неудобный сценарий.`
        : `${favoriteName} enters this matchup with the sturdier statistical base. Record, output, and defensive numbers create a ${confidenceLabel}, but ${underdogName} still has routes back into the fight if the matchup gets uncomfortable.`,
    keyEdge:
      locale === "ru"
        ? `${favoriteName} выигрывает предматчевую картину за счет более собранного набора цифр и меньшего числа очевидных провалов по профилю.`
        : `${favoriteName} wins the pre-fight picture through the cleaner all-around statistical profile and fewer obvious weak points.`,
    fightScript:
      locale === "ru"
        ? `Если бой останется структурным, преимущество должно постепенно смещаться к ${favoriteName}. ${underdogName} нуждается в более рваном рисунке, смене фаз и эпизодах, где можно навязать свой темп или силовой момент.`
        : `If the fight stays orderly, the edge should keep tilting toward ${favoriteName}. ${underdogName} needs more disruption, more phase changes, and moments where raw leverage or timing can bend the fight.`,
    pick:
      locale === "ru"
        ? `Выбор FightBase: ${favoriteName} - ${confidenceLabel}.`
        : `FightBase pick: ${favoriteName} with a ${confidenceLabel}.`,
    formA: summarizeRecentForm(fighterA, locale),
    formB: summarizeRecentForm(fighterB, locale),
    pathA: paths.fighterA,
    pathB: paths.fighterB,
    statLines
  };
}
