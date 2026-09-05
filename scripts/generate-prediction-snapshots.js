#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const ufcNameDictionary = require("../lib/ufc-name-dictionary.json");

const prisma = new PrismaClient();

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

const {
  computeAiContentHash,
  generateAiPredictionCopy,
  isPlaceholderFight,
  resolvePredictionAiConfig
} = require("./prediction-ai-copy");

// Провайдер и модель прогнозов задаются отдельно от новостей: PREDICTION_AI_PROVIDER,
// PREDICTION_AI_MODEL (см. resolvePredictionAiConfig).
function getAiCopyConfig() {
  return resolvePredictionAiConfig(readEnv);
}

function parseArgs(argv) {
  const options = {
    limit: 500,
    dryRun: false,
    regenerate: false,
    eventSlug: null,
    fightSlug: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[index + 1]) || options.limit;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
    if (arg === "--regenerate") {
      options.regenerate = true;
    }
    if (arg === "--event-slug" && argv[index + 1]) {
      options.eventSlug = argv[++index];
    }
    if (arg === "--fight-slug" && argv[index + 1]) {
      options.fightSlug = argv[++index];
    }
  }

  return options;
}

// Принудительная перегенерация меняет и выбор победителя: только до начала
// турнира. Обычный запуск по-прежнему сохраняет первоначальный выбор.
function canRegeneratePrediction(fight, now = new Date()) {
  const event = fight.event;
  const start = event?.earlyPrelimsAt || event?.prelimsAt || event?.mainCardAt || event?.date;
  return fight.status === "scheduled" && event?.status === "upcoming" && new Date(start).getTime() > now.getTime();
}

function parseRecord(record) {
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

function getImpliedWinProbabilities(oddsA, oddsB) {
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

function getHeuristicPredictionScore(fighter) {
  const parsed = parseRecord(fighter.record);
  const totalFights = parsed.wins + parsed.losses + parsed.draws;
  const winRate = totalFights > 0 ? parsed.wins / totalFights : 0.45;

  let score = 18 + winRate * 52;
  const recent = (fighter.recentFights || []).slice(0, 3);
  const recentWins = recent.filter((fight) => /побед|win/i.test(fight.result)).length;
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

function getFightWinPercentages(fighterA, fighterB, odds) {
  const implied = odds && getImpliedWinProbabilities(odds.oddsA, odds.oddsB);
  if (implied) {
    return {
      percentA: Math.round(implied.pA * 100),
      percentB: Math.round(implied.pB * 100),
      source: "odds"
    };
  }

  const scoreA = getHeuristicPredictionScore(fighterA);
  const scoreB = getHeuristicPredictionScore(fighterB);
  const total = Math.max(scoreA + scoreB, 0.001);

  return {
    percentA: Math.round((scoreA / total) * 100),
    percentB: Math.round((scoreB / total) * 100),
    source: "heuristic"
  };
}

function getDisplayName(fighter, locale) {
  return locale === "ru" ? fighter.nameRu || fighter.name : fighter.name;
}

function normalizeRussianMmaText(value) {
  let next = String(value || "")
    .replace(/\bЧриса\b/gi, "Криса")
    .replace(/\bЧрису\b/gi, "Крису")
    .replace(/\bЧрисом\b/gi, "Крисом")
    .replace(/\bЧрисе\b/gi, "Крисе")
    .replace(/\bЧрис\b/gi, "Крис")
    .replace(/\bАлександера\b/gi, "Александра")
    .replace(/\bАлександеру\b/gi, "Александру")
    .replace(/\bАлександером\b/gi, "Александром")
    .replace(/\bАлександере\b/gi, "Александре")
    .replace(/\bАлександер\b/gi, "Александр")
    .replace(/\bРенье де Риддер\b/gi, "Ренье де Риддер");
  for (const [englishName, russianName] of Object.entries(ufcNameDictionary.fullNames || {})) {
    next = next.replace(new RegExp(`\\b${englishName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), russianName);
  }

  for (const [wrongValue, correctValue] of Object.entries(ufcNameDictionary.ruCorrections || {})) {
    next = next.replace(new RegExp(`\\b${wrongValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), correctValue);
  }

  return next;
}

function formatPercent(value) {
  return value == null ? null : `${Math.round(value)}%`;
}

function getSurnameToken(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-1)[0]
    ?.toLowerCase();
}

function getFighterNameTokens(fighter) {
  return [fighter?.name, fighter?.nameRu]
    .flatMap((value) => [getSurnameToken(value)])
    .filter(Boolean);
}

function isMainEventFight(fight) {
  if (fight.isMainEvent === true) return true;

  const eventName = String(fight.event?.name || "").toLowerCase();
  const fighterATokens = getFighterNameTokens(fight.fighterA);
  const fighterBTokens = getFighterNameTokens(fight.fighterB);

  return (
    fighterATokens.some((token) => eventName.includes(token)) &&
    fighterBTokens.some((token) => eventName.includes(token))
  );
}

function summarizeRecentForm(fighter, locale) {
  const recent = (fighter.recentFights || []).slice(0, 3);
  if (recent.length === 0) {
    return locale === "ru"
      ? `${getDisplayName(fighter, locale)}: последние бои ещё не добавлены в профиль FightBase.`
      : `${getDisplayName(fighter, locale)}: recent bouts have not been added to the FightBase profile yet.`;
  }

  const wins = recent.filter((fight) => /побед|win/i.test(fight.result)).length;
  const losses = recent.filter((fight) => /поражен|loss/i.test(fight.result)).length;
  const latest = recent[0];

  if (locale === "ru") {
    return `${getDisplayName(fighter, locale)}: в последних ${recent.length} боях по базе ${wins}-${losses}. Последний соперник: ${latest.opponentNameRu || latest.opponentName}.`;
  }

  return `${getDisplayName(fighter, locale)} is ${wins}-${losses} across the last ${recent.length} logged fights. Latest opponent: ${latest.opponentName}.`;
}

function compareMetric(labelRu, labelEn, left, right, locale, formatter = (value) => (value == null ? null : value.toFixed(2))) {
  if (left == null && right == null) {
    return null;
  }

  const leftValue = formatter(left) ?? "—";
  const rightValue = formatter(right) ?? "—";

  return locale === "ru" ? `${labelRu}: ${leftValue} — ${rightValue}` : `${labelEn}: ${leftValue} vs ${rightValue}`;
}

function buildPathsToVictory(locale, fighterA, fighterB) {
  const fighterAName = getDisplayName(fighterA, locale);
  const fighterBName = getDisplayName(fighterB, locale);
  const aPressure = (fighterA.sigStrikesLandedPerMin ?? 0) > (fighterB.sigStrikesLandedPerMin ?? 0);
  const aWrestling = (fighterA.takedownAveragePer15 ?? 0) > (fighterB.takedownAveragePer15 ?? 0);
  const bSubThreat = (fighterB.submissionAveragePer15 ?? 0) > (fighterA.submissionAveragePer15 ?? 0);

  return {
    fighterA:
      locale === "ru"
        ? `${fighterAName}: ${aPressure ? "преимущество в объеме ударов" : "нужно контролировать темп и дистанцию"}${aWrestling ? ", есть угроза переводов" : ""}.`
        : `${fighterAName}: ${aPressure ? "volume edge on the feet" : "needs to control pace and range"}${aWrestling ? ", with a takedown threat" : ""}.`,
    fighterB:
      locale === "ru"
        ? `${fighterBName}: ${bSubThreat ? "опасен в борьбе и на сабмишенах" : "выигрывает за счет тяжелых обменов и контратак"}.`
        : `${fighterBName}: ${bSubThreat ? "offers grappling and submission danger" : "thrives in heavy exchanges and counters"}.`
  };
}

function buildConfidenceLabel(locale, impliedMargin, margin, hasOdds) {
  if (hasOdds && impliedMargin > 0.18) {
    return locale === "ru" ? "явное преимущество" : "clear edge";
  }
  if (hasOdds && impliedMargin > 0.08) {
    return locale === "ru" ? "умеренное преимущество" : "moderate edge";
  }
  if (hasOdds) {
    return locale === "ru" ? "очень близкий бой" : "close matchup";
  }
  if (margin > 18) {
    return locale === "ru" ? "заметное преимущество по профилю" : "clear edge on paper";
  }
  if (margin > 8) {
    return locale === "ru" ? "небольшое преимущество" : "slight edge";
  }
  return locale === "ru" ? "равный матчап" : "toss-up";
}

function buildSnapshotCopy(locale, fight) {
  const odds = { oddsA: fight.oddsA ?? null, oddsB: fight.oddsB ?? null };
  const implied = getImpliedWinProbabilities(odds.oddsA, odds.oddsB);
  const scoreA = getHeuristicPredictionScore(fight.fighterA);
  const scoreB = getHeuristicPredictionScore(fight.fighterB);
  const favorite = implied
    ? implied.pA >= implied.pB
      ? fight.fighterA
      : fight.fighterB
    : scoreA >= scoreB
      ? fight.fighterA
      : fight.fighterB;
  const underdog = favorite.id === fight.fighterA.id ? fight.fighterB : fight.fighterA;
  const favoriteName = getDisplayName(favorite, locale);
  const underdogName = getDisplayName(underdog, locale);
  const impliedMargin = implied ? Math.abs(implied.pA - implied.pB) : 0;
  const margin = Math.abs(scoreA - scoreB);
  const confidenceLabel = buildConfidenceLabel(locale, impliedMargin, margin, Boolean(implied));
  const { percentA, percentB, source } = getFightWinPercentages(fight.fighterA, fight.fighterB, odds);
  const paths = buildPathsToVictory(locale, fight.fighterA, fight.fighterB);
  const fighterAName = getDisplayName(fight.fighterA, locale);
  const fighterBName = getDisplayName(fight.fighterB, locale);

  const statLines = [
    compareMetric("SLpM", "SLpM", fight.fighterA.sigStrikesLandedPerMin, fight.fighterB.sigStrikesLandedPerMin, locale),
    compareMetric("Точность ударов", "Strike accuracy", fight.fighterA.strikeAccuracy, fight.fighterB.strikeAccuracy, locale, formatPercent),
    compareMetric("Защита в стойке", "Strike defense", fight.fighterA.strikeDefense, fight.fighterB.strikeDefense, locale, formatPercent),
    compareMetric("TD avg", "TD avg", fight.fighterA.takedownAveragePer15, fight.fighterB.takedownAveragePer15, locale),
    compareMetric("TD defense", "TD defense", fight.fighterA.takedownDefense, fight.fighterB.takedownDefense, locale, formatPercent),
    compareMetric("Sub avg", "Sub avg", fight.fighterA.submissionAveragePer15, fight.fighterB.submissionAveragePer15, locale)
  ].filter(Boolean);

  // RU-шаблоны держат имена только в именительном падеже: склонятора нет, а
  // конструкции вида «у {имя} есть…» дают «у Ислам Махачев есть…».
  const overview =
    locale === "ru"
      ? `${favoriteName} подходит к бою с небольшим преимуществом по общей картине матча. Это не гарантирует исход: ${underdogName} сохраняет рабочие пути к победе.`
      : `${favoriteName} appears to hold a slight edge in the overall matchup picture. That is not a guarantee, and ${underdogName} still has viable paths to win.`;
  const keyEdge =
    source === "odds"
      ? locale === "ru"
        ? `${favoriteName} выходит на бой с небольшим преимуществом по котировкам, но ключевым фактором все равно остается сам матчап.`
        : `${favoriteName} may carry a slight edge before the opening bell, but the matchup itself remains the key factor.`
      : locale === "ru"
        ? `Оцениваем бой по рекорду, текущей форме и UFC-статистике, где она заполнена.`
        : `We evaluate the fight through record, current form, and UFC stats where available.`;
  const fightScript =
    locale === "ru"
      ? `Ключевой вопрос этого боя — кто навяжет темп и удобную дистанцию. ${favoriteName} сильнее в привычном ритме, тогда как ${underdogName} будет искать бой с резкими сменами эпизодов и тяжелыми моментами.`
      : `The key question is who imposes pace and range. ${favoriteName} benefits from a familiar rhythm, while ${underdogName} needs disruption and heavier moments.`;

  const eventDate = new Date(fight.event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const promotionLabel = fight.event.promotion.shortName || fight.event.promotion.name;
  // "UFC 330: Makhachev vs. Machado Garry" -> "UFC 330": в заголовке прогноза имена уже
  // есть, полное название турнира дублировало бы их второй раз.
  const eventShortName = (fight.event.name.split(":")[0] || fight.event.name).trim() || fight.event.name;
  const mainEvent = isMainEventFight(fight);
  const headline = mainEvent
    ? locale === "ru"
      ? `${fighterAName} — ${fighterBName}: прогноз на главный бой ${eventShortName}`
      : `${fighterAName} vs ${fighterBName}: main event prediction for ${eventShortName}`
    : locale === "ru"
      ? `${fighterAName} — ${fighterBName}: прогноз и анализ боя ${promotionLabel}`
      : `${fighterAName} vs ${fighterBName}: prediction and fight analysis for ${promotionLabel}`;
  const titleTag = mainEvent
    ? locale === "ru"
      ? `${fighterAName} — ${fighterBName}: прогноз на главный бой UFC, анализ и шансы`
      : `${fighterAName} vs ${fighterBName}: UFC main event prediction, analysis, and preview`
    : locale === "ru"
      ? `${fighterAName} — ${fighterBName}: прогноз на бой ${promotionLabel}, анализ и шансы`
      : `${fighterAName} vs ${fighterBName}: ${promotionLabel} fight prediction, analysis, and preview`;
  const metaDescription = mainEvent
    ? locale === "ru"
      ? `Прогноз на главный бой ${eventShortName}: ${fighterAName} — ${fighterBName} (${eventDate}). Анализ матча UFC, сильные стороны бойцов, сценарий поединка, статистика и ключевые факторы перед боем.`
      : `Main event prediction for ${eventShortName}: ${fighterAName} vs ${fighterBName} on ${eventDate}. UFC fight analysis, matchup edges, likely fight script, stats, and key factors.`
    : locale === "ru"
      ? `Прогноз на бой ${fighterAName} — ${fighterBName} на турнире ${fight.event.name} (${eventDate}). Анализ боя UFC, ключевое преимущество, сценарий поединка, статистика и подробный разбор матча.`
      : `Prediction for ${fighterAName} vs ${fighterBName} at ${fight.event.name} on ${eventDate}. UFC fight analysis, matchup edge, likely fight script, stats, and a detailed preview.`;
  const excerpt =
    locale === "ru"
      ? `Подробный прогноз на бой ${fighterAName} — ${fighterBName}: ${overview} ${keyEdge}`
      : `Full prediction for ${fighterAName} vs ${fighterBName}: ${overview} ${keyEdge}`;

  return {
    headline,
    titleTag,
    metaDescription,
    excerpt,
    pick: favoriteName,
    confidenceLabel,
    overview,
    keyEdge,
    fightScript,
    formA: summarizeRecentForm(fight.fighterA, locale),
    formB: summarizeRecentForm(fight.fighterB, locale),
    pathA: paths.fighterA,
    pathB: paths.fighterB,
    statLines: statLines.join("\n"),
    percentA,
    percentB,
    source
  };
}

function normalizeRuSnapshot(copy) {
  return Object.fromEntries(
    Object.entries(copy).map(([key, value]) => [
      key,
      typeof value === "string" ? normalizeRussianMmaText(value) : value
    ])
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const fights = await prisma.fight.findMany({
    where: {
      status: "scheduled",
      ...(options.fightSlug ? { slug: options.fightSlug } : {}),
      event: {
        status: { in: options.regenerate ? ["upcoming"] : ["upcoming", "live"] },
        ...(options.eventSlug ? { slug: options.eventSlug } : {})
      }
    },
    include: {
      event: {
        include: {
          promotion: true
        }
      },
      fighterA: {
        include: {
          recentFights: {
            orderBy: { date: "desc" },
            take: 3
          }
        }
      },
      fighterB: {
        include: {
          recentFights: {
            orderBy: { date: "desc" },
            take: 3
          }
        }
      }
    },
    orderBy: [
      { event: { date: "asc" } },
      { isMainEvent: "desc" },
      { boutOrder: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
      { id: "asc" }
    ],
    take: options.limit
  });

  // Снапшоты завершённых боёв НЕ удаляем: это архив прогнозов с результатом
  // и источник статистики точности. Снапшоты отменённых боёв уходят каскадом
  // вместе с Fight (onDelete: Cascade).
  const eligibleFightIds = fights.map((fight) => fight.id);

  const existingSnapshots = new Map(
    (
      await prisma.fightPredictionSnapshot.findMany({
        where: { fightId: { in: eligibleFightIds } },
        select: {
          fightId: true,
          aiContentHash: true,
          aiGeneratedAt: true,
          aiPickFighterId: true,
          aiPickReasonRu: true,
          aiPickGeneratedAt: true,
          oddsAAtPick: true,
          oddsBAtPick: true,
          excerptRu: true,
          overviewRu: true,
          keyEdgeRu: true,
          fightScriptRu: true,
          pathARu: true,
          pathBRu: true
        }
      })
    ).map((snapshot) => [snapshot.fightId, snapshot])
  );

  const aiConfig = getAiCopyConfig();
  if (options.regenerate && !aiConfig) throw new Error("AI configuration is required for --regenerate");
  let aiGeneratedCount = 0;
  let aiReusedCount = 0;
  let aiFallbackCount = 0;

  let upserted = 0;
  let skipped = 0;

  for (const fight of fights) {
    if (options.regenerate && !canRegeneratePrediction(fight)) {
      skipped += 1;
      console.log(`[skipped] event already started: ${fight.event.slug}`);
      continue;
    }
    const baseRu = normalizeRuSnapshot(buildSnapshotCopy("ru", fight));
    const en = buildSnapshotCopy("en", fight);
    let ru = baseRu;
    let aiContentHash = null;
    let aiGeneratedAt = null;

    // Пик модели фиксируется при первой генерации и сохраняется при любой
    // регенерации текстов, пока не сменился состав боя, — иначе статистика
    // меткости превратилась бы в подгонку задним числом.
    const existing = existingSnapshots.get(fight.id);
    const existingPickIsValid =
      existing?.aiPickFighterId &&
      (existing.aiPickFighterId === fight.fighterAId || existing.aiPickFighterId === fight.fighterBId);
    let aiPickFighterId = existingPickIsValid ? existing.aiPickFighterId : null;
    let aiPickReasonRu = existingPickIsValid ? existing.aiPickReasonRu : null;
    let aiPickGeneratedAt = existingPickIsValid ? existing.aiPickGeneratedAt : null;
    let oddsAAtPick = existingPickIsValid ? existing.oddsAAtPick : null;
    let oddsBAtPick = existingPickIsValid ? existing.oddsBAtPick : null;

    if (aiConfig && !isPlaceholderFight(fight)) {
      const odds = { oddsA: fight.oddsA ?? null, oddsB: fight.oddsB ?? null };
      const percents = getFightWinPercentages(fight.fighterA, fight.fighterB, odds);
      const nextHash = computeAiContentHash(fight, percents);

      if (!options.regenerate && existing?.aiContentHash === nextHash && existing.aiGeneratedAt) {
        ru = {
          ...baseRu,
          excerpt: existing.excerptRu,
          overview: existing.overviewRu,
          keyEdge: existing.keyEdgeRu,
          fightScript: existing.fightScriptRu,
          pathA: existing.pathARu,
          pathB: existing.pathBRu
        };
        aiContentHash = existing.aiContentHash;
        aiGeneratedAt = existing.aiGeneratedAt;
        aiReusedCount += 1;
      } else {
        const generated = await generateAiPredictionCopy({ fight, config: aiConfig });
        if (generated) {
          const fighterAName = getDisplayName(fight.fighterA, "ru");
          const fighterBName = getDisplayName(fight.fighterB, "ru");
          ru = normalizeRuSnapshot({
            ...baseRu,
            ...generated.copy,
            excerpt: `Подробный прогноз на бой ${fighterAName} — ${fighterBName}: ${generated.copy.overview}`
          });
          aiContentHash = nextHash;
          aiGeneratedAt = new Date();
          aiGeneratedCount += 1;

          if (!aiPickFighterId || options.regenerate) {
            aiPickFighterId = generated.pick === "A" ? fight.fighterAId : fight.fighterBId;
            aiPickReasonRu = normalizeRussianMmaText(generated.pickReason);
            aiPickGeneratedAt = new Date();
            if (options.regenerate) {
              oddsAAtPick = null;
              oddsBAtPick = null;
            }
          }
        } else {
          aiFallbackCount += 1;
          if (options.regenerate) {
            console.warn(`[ai-copy] regeneration failed, snapshot preserved: ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
            continue;
          }
          console.warn(`[ai-copy] fallback to template: ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
        }
      }
    }

    // Цена пика для ROI: первые доступные кэфы после появления пика. Дальше
    // линия может плавать — зафиксированное значение не трогаем, это цена,
    // которую видел читатель при публикации прогноза.
    if (aiPickFighterId && oddsAAtPick == null && fight.oddsA > 1 && fight.oddsB > 1) {
      oddsAAtPick = fight.oddsA;
      oddsBAtPick = fight.oddsB;
    }

    const payload = {
      eventId: fight.eventId,
      headlineRu: ru.headline,
      headlineEn: en.headline,
      titleTagRu: ru.titleTag,
      titleTagEn: en.titleTag,
      metaDescriptionRu: ru.metaDescription,
      metaDescriptionEn: en.metaDescription,
      excerptRu: ru.excerpt,
      excerptEn: en.excerpt,
      pickRu: ru.pick,
      pickEn: en.pick,
      confidenceLabelRu: ru.confidenceLabel,
      confidenceLabelEn: en.confidenceLabel,
      overviewRu: ru.overview,
      overviewEn: en.overview,
      keyEdgeRu: ru.keyEdge,
      keyEdgeEn: en.keyEdge,
      fightScriptRu: ru.fightScript,
      fightScriptEn: en.fightScript,
      formARu: ru.formA,
      formAEn: en.formA,
      formBRu: ru.formB,
      formBEn: en.formB,
      pathARu: ru.pathA,
      pathAEn: en.pathA,
      pathBRu: ru.pathB,
      pathBEn: en.pathB,
      statLinesRu: ru.statLines,
      statLinesEn: en.statLines,
      percentA: ru.percentA,
      percentB: ru.percentB,
      source: ru.source,
      sourceOddsUpdatedAt: fight.oddsUpdatedAt ?? null,
      aiContentHash,
      aiGeneratedAt,
      aiPickFighterId,
      aiPickReasonRu,
      aiPickGeneratedAt,
      oddsAAtPick,
      oddsBAtPick,
      generatedAt: new Date()
    };

    if (options.dryRun) {
      console.log(
        `[dry-run] ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}${aiGeneratedAt ? " | AI" : " | template"}`
      );
      if (aiGeneratedAt) {
        if (aiPickFighterId) {
          const pickName =
            aiPickFighterId === fight.fighterAId ? fight.fighterA.name : fight.fighterB.name;
          console.log(`  pick: ${pickName} — ${aiPickReasonRu}`);
        }
        console.log(`  overview: ${ru.overview}`);
        console.log(`  keyEdge: ${ru.keyEdge}`);
        console.log(`  fightScript: ${ru.fightScript}`);
        console.log(`  pathA: ${ru.pathA}`);
        console.log(`  pathB: ${ru.pathB}`);
      }
      continue;
    }

    if (options.regenerate) {
      const current = await prisma.fight.findUnique({ where: { id: fight.id }, include: { event: true } });
      if (!current || !canRegeneratePrediction(current) || current.fighterAId !== fight.fighterAId || current.fighterBId !== fight.fighterBId) {
        skipped += 1;
        console.warn(`[skipped] fight changed during generation: ${fight.id}`);
        continue;
      }
    }

    await prisma.fightPredictionSnapshot.upsert({
      where: { fightId: fight.id },
      create: {
        fightId: fight.id,
        ...payload
      },
      update: payload
    });

    upserted += 1;
    console.log(`[snapshot] ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
  }

  console.log("");
  console.log(`Eligible fights: ${fights.length}`);
  console.log(`Upserted snapshots: ${options.dryRun ? 0 : upserted}`);
  console.log(`Skipped fights: ${skipped}`);
  if (options.regenerate && aiFallbackCount > 0) process.exitCode = 1;

  const aiAttempted = aiGeneratedCount + aiFallbackCount;
  if (aiConfig) {
    console.log(`AI copy: generated ${aiGeneratedCount}, reused ${aiReusedCount}, fallback ${aiFallbackCount}`);
  }
  if (!options.dryRun && aiAttempted > 0 && aiFallbackCount / aiAttempted > 0.2) {
    await prisma.systemEvent
      .create({
        data: {
          level: "warn",
          category: "predictions.ai-copy",
          message: `AI prediction copy fallback rate ${aiFallbackCount}/${aiAttempted}`,
          source: "scripts/generate-prediction-snapshots"
        }
      })
      .catch(() => {});
  }
}

module.exports = { parseArgs, canRegeneratePrediction, main };

if (require.main === module) main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
