// Посты ИИ-модели FightBase для Telegram-канала: пики на весь кард до турнира и
// итоги после него — когда их публиковать и что в них писать. Bot API и база —
// в lib/telegram-picks-runner.ts, здесь только чистые функции. Пики и вердикты
// считают те же функции, что сайт, чтобы канал и страницы не расходились.

import { getDisplayName } from "@/lib/display";
import { describeFightPick } from "@/lib/event-picks";
import { formatCardNightLabel, formatCardTime } from "@/lib/event-time";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";
import { resolveValuePick, resolveValueUnits } from "@/lib/prediction-value";
import { resolveAiPickVerdict, resolvePredictionVerdict } from "@/lib/prediction-verdict";

// Пики части боёв считаются за недели до турнира, поэтому без окна пост ушёл бы
// за месяц. За 36 часов публикуем и неполный кард: остальные пики допишет правка.
export const POST_WINDOW_HOURS = 72;
export const PARTIAL_POST_HOURS = 36;
// Итоги ждут результатов всех боёв с пиком, но не дольше 18 часов от начала:
// надёжного времени завершения турнира в базе нет. Старше недели — не публикуем.
export const RESULTS_FALLBACK_HOURS = 18;
export const RESULTS_STALE_HOURS = 7 * 24;
export const TELEGRAM_TEXT_MAX = 4096;

const HOUR_MS = 3_600_000;

type PicksFighter = { id: string; name: string; nameRu?: string | null };

export type TelegramPicksFight = FightCardSortable & {
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  fighterAId: string;
  fighterBId: string;
  fighterA: PicksFighter;
  fighterB: PicksFighter;
  predictionSnapshot: {
    aiPickFighterId: string | null;
    percentA: number;
    percentB: number;
    aiWinChanceA: number | null;
    oddsAAtPick: number | null;
    oddsBAtPick: number | null;
  } | null;
};

export type TelegramPicksEvent = {
  id: string;
  slug: string;
  name: string;
  status: string;
  date: Date;
  earlyPrelimsAt: Date | null;
  prelimsAt: Date | null;
  mainCardAt: Date | null;
  fights: TelegramPicksFight[];
};

export type TelegramPicksAction = "post" | "edit" | "wait" | "closed";
export type TelegramResultsAction = "post" | "wait" | "skip";

// Счёт модели и фаворита за последние турниры — форма ответа getPredictionAccuracy.
export type TelegramResultsAccuracy = {
  eventsCount: number;
  model: { correct: number; judged: number; percent: number | null };
  favorite: { percent: number | null };
};

export function resolveEventStart(event: Pick<TelegramPicksEvent, "date" | "earlyPrelimsAt" | "prelimsAt" | "mainCardAt">) {
  return event.earlyPrelimsAt ?? event.prelimsAt ?? event.mainCardAt ?? event.date;
}

export function decideTelegramPicksAction({
  event,
  hasPost,
  now
}: {
  event: TelegramPicksEvent;
  hasPost: boolean;
  now: Date;
}): TelegramPicksAction {
  const hoursLeft = (resolveEventStart(event).getTime() - now.getTime()) / HOUR_MS;
  if (hoursLeft <= 0) return "closed";
  if (hasPost) return "edit";
  if (hoursLeft > POST_WINDOW_HOURS) return "wait";

  const scheduled = event.fights.filter((fight) => fight.status === "scheduled");
  const picked = scheduled.filter((fight) => describeFightPick(fight)).length;
  if (picked === 0) return "wait";
  return picked === scheduled.length || hoursLeft < PARTIAL_POST_HOURS ? "post" : "wait";
}

export function decideTelegramResultsAction({
  event,
  hasResultsPost,
  now
}: {
  event: TelegramPicksEvent;
  hasResultsPost: boolean;
  now: Date;
}): TelegramResultsAction {
  if (hasResultsPost) return "skip";
  const hoursSinceStart = (now.getTime() - resolveEventStart(event).getTime()) / HOUR_MS;
  if (hoursSinceStart > RESULTS_STALE_HOURS) return "skip";
  if (event.status !== "completed") return "wait";

  const allPicksSettled = event.fights.every(
    (fight) => !fight.predictionSnapshot?.aiPickFighterId || fight.status === "completed"
  );
  return allPicksSettled || hoursSinceStart >= RESULTS_FALLBACK_HOURS ? "post" : "wait";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventDateLine(event: TelegramPicksEvent) {
  if (event.mainCardAt) {
    return `${capitalize(formatCardNightLabel(event.mainCardAt, "ru"))} · основной кард в ${formatCardTime(event.mainCardAt, "ru")} мск`;
  }
  // date — полночь UTC «дня турнира», поэтому форматируем в UTC.
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(event.date);
}

function fighterNames(fight: TelegramPicksFight) {
  return { nameA: getDisplayName(fight.fighterA, "ru"), nameB: getDisplayName(fight.fighterB, "ru") };
}

// Бои в порядке карда, разложенные на «Основной кард» и «Прелимы»; пустые группы опускаются.
function buildCardBlocks(fights: TelegramPicksFight[], formatLine: (fight: TelegramPicksFight) => string) {
  const sorted = sortFightsForCard(fights);
  const isMainCard = (fight: TelegramPicksFight) => Boolean(fight.isMainEvent) || fight.stage === "main_card";
  const groups: Array<[string, TelegramPicksFight[]]> = [
    ["Основной кард", sorted.filter(isMainCard)],
    ["Прелимы", sorted.filter((fight) => !isMainCard(fight))]
  ];
  return groups
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => [title, ...list.map(formatLine)].join("\n"));
}

// Укладывает пост в лимит Telegram: сначала убирает строки ценного выбора с конца,
// потом обрезает текст.
function fitTelegramText(compose: (valueLines: string[]) => string, valueLines: string[]) {
  let lines = valueLines;
  let text = compose(lines);
  while (text.length > TELEGRAM_TEXT_MAX && lines.length > 0) {
    lines = lines.slice(0, -1);
    text = compose(lines);
  }
  return text.length > TELEGRAM_TEXT_MAX ? `${text.slice(0, TELEGRAM_TEXT_MAX - 1).trimEnd()}…` : text;
}

function resolveFightValuePick(fight: TelegramPicksFight) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot) return null;
  return resolveValuePick({
    aiWinChanceA: snapshot.aiWinChanceA,
    oddsAAtPick: snapshot.oddsAAtPick,
    oddsBAtPick: snapshot.oddsBAtPick,
    fighterAId: fight.fighterAId,
    fighterBId: fight.fighterBId
  });
}

function formatValuePickLabel(fight: TelegramPicksFight, valuePick: NonNullable<ReturnType<typeof resolveFightValuePick>>) {
  const name = getDisplayName(valuePick.side === "A" ? fight.fighterA : fight.fighterB, "ru");
  return `💎 Ценный выбор: ${name} (кэф ${valuePick.odds.toFixed(2).replace(".", ",")})`;
}

function formatPickLine(fight: TelegramPicksFight) {
  const { nameA, nameB } = fighterNames(fight);
  const pick = describeFightPick(fight);
  const verdict = pick ? `${pick.side === "A" ? nameA : nameB}, ${pick.percent}%` : "пик позже";
  return `• ${nameA} — ${nameB} → ${verdict}`;
}

export function buildTelegramPicksPost(event: TelegramPicksEvent, siteUrl: string) {
  const fights = event.fights.filter((fight) => fight.status === "scheduled");
  const head = `🥊 Пики ИИ-модели FightBase: ${event.name}\n${formatEventDateLine(event)}`;
  const cardBlocks = buildCardBlocks(fights, formatPickLine);
  const link = `Все разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`;
  const valueLines = sortFightsForCard(fights).flatMap((fight) => {
    const valuePick = resolveFightValuePick(fight);
    return valuePick ? [formatValuePickLabel(fight, valuePick)] : [];
  });

  return fitTelegramText(
    (lines) => [head, ...cardBlocks, ...(lines.length > 0 ? [lines.join("\n")] : []), link].join("\n\n"),
    valueLines
  );
}

// Фаворит по предматчевой оценке (percentA/percentB), как в getPredictionAccuracy.
function favoriteFighterId(fight: TelegramPicksFight) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot || snapshot.percentA === snapshot.percentB) return null;
  return snapshot.percentA > snapshot.percentB ? fight.fighterAId : fight.fighterBId;
}

function formatResultLine(fight: TelegramPicksFight) {
  const { nameA, nameB } = fighterNames(fight);
  const pair = `${nameA} — ${nameB}`;
  if (fight.resultType === "draw") return `➖ ${pair} · ничья, в счёт не идёт`;
  if (fight.resultType !== "win" || !fight.winnerFighterId) return `➖ ${pair} · NC, в счёт не идёт`;

  const winner = fight.winnerFighterId === fight.fighterAId ? nameA : nameB;
  const pickId = fight.predictionSnapshot?.aiPickFighterId;
  if (!pickId || (pickId !== fight.fighterAId && pickId !== fight.fighterBId)) return `▫️ ${pair} · победил ${winner}`;
  if (pickId === fight.winnerFighterId) {
    const favoriteId = favoriteFighterId(fight);
    return `✅ ${pair} · победил ${winner}${favoriteId && favoriteId !== pickId ? " 🔥 против фаворита" : ""}`;
  }
  return `❌ ${pair} · пик ${pickId === fight.fighterAId ? nameA : nameB}, победил ${winner}`;
}

function formatEventScoreLine(fights: TelegramPicksFight[]) {
  const model = { correct: 0, judged: 0 };
  const favorite = { correct: 0, judged: 0 };
  for (const fight of fights) {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot) continue;
    const outcome = { status: fight.status, resultType: fight.resultType, winnerFighterId: fight.winnerFighterId };
    const modelVerdict = resolveAiPickVerdict({ aiPickFighterId: snapshot.aiPickFighterId, ...outcome });
    const favoriteVerdict = resolvePredictionVerdict({
      percentA: snapshot.percentA,
      percentB: snapshot.percentB,
      fighterAId: fight.fighterAId,
      fighterBId: fight.fighterBId,
      ...outcome
    });
    for (const [bucket, verdict] of [[model, modelVerdict], [favorite, favoriteVerdict]] as const) {
      if (verdict === "correct" || verdict === "wrong") bucket.judged += 1;
      if (verdict === "correct") bucket.correct += 1;
    }
  }

  if (model.judged === 0) return "Пики модели в этом турнире в зачёт не попали";
  const percent = Math.round((model.correct / model.judged) * 100);
  const favoritePart = favorite.judged > 0 ? ` · фаворит по предматчевой оценке — ${favorite.correct} из ${favorite.judged}` : "";
  return `Угадала ${model.correct} из ${model.judged} (${percent}%)${favoritePart}`;
}

function formatEventsCount(count: number) {
  if (count === 1) return "За последний турнир";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "турнир" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "турнира" : "турниров";
  return `За последние ${count} ${word}`;
}

function formatAccuracyLine(accuracy: TelegramResultsAccuracy) {
  if (accuracy.model.percent === null) return null;
  const favoritePart = accuracy.favorite.percent !== null ? `, фаворит — ${accuracy.favorite.percent}%` : "";
  return `${formatEventsCount(accuracy.eventsCount)}: ${accuracy.model.percent}% (${accuracy.model.correct} из ${accuracy.model.judged})${favoritePart}`;
}

export function buildTelegramResultsPost(event: TelegramPicksEvent, accuracy: TelegramResultsAccuracy, siteUrl: string) {
  const fights = event.fights.filter((fight) => fight.status === "completed");
  const head = `📊 Итоги ИИ-модели FightBase: ${event.name}\n${formatEventScoreLine(fights)}`;
  const cardBlocks = buildCardBlocks(fights, formatResultLine);
  const accuracyLine = formatAccuracyLine(accuracy);
  const footer = [accuracyLine, `Результаты и разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`]
    .filter(Boolean)
    .join("\n");
  const valueLines = sortFightsForCard(fights).flatMap((fight) => {
    const valuePick = resolveFightValuePick(fight);
    const units = resolveValueUnits(valuePick, fight);
    if (!valuePick || units === null) return [];
    return [`${formatValuePickLabel(fight, valuePick)} — ${units > 0 ? "сыграл" : "не сыграл"}`];
  });

  return fitTelegramText(
    (lines) => [head, ...cardBlocks, ...(lines.length > 0 ? [lines.join("\n")] : []), footer].join("\n\n"),
    valueLines
  );
}
