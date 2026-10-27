// Пост с пиками ИИ-модели FightBase на весь кард для Telegram-канала: когда его
// публиковать и что в нём писать. Bot API и база — в lib/telegram-picks-runner.ts,
// здесь только чистые функции. Пик и процент считает describeFightPick — тот же,
// что в карде на сайте, чтобы канал и страница турнира не расходились.

import { getDisplayName } from "@/lib/display";
import { describeFightPick } from "@/lib/event-picks";
import { formatCardNightLabel, formatCardTime } from "@/lib/event-time";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";
import { resolveValuePick } from "@/lib/prediction-value";

// Пики части боёв считаются за недели до турнира, поэтому без окна пост ушёл бы
// за месяц. За 36 часов публикуем и неполный кард: остальные пики допишет правка.
export const POST_WINDOW_HOURS = 72;
export const PARTIAL_POST_HOURS = 36;
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
  date: Date;
  earlyPrelimsAt: Date | null;
  prelimsAt: Date | null;
  mainCardAt: Date | null;
  fights: TelegramPicksFight[];
};

export type TelegramPicksAction = "post" | "edit" | "wait" | "closed";

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

function formatFightLine(fight: TelegramPicksFight) {
  const nameA = getDisplayName(fight.fighterA, "ru");
  const nameB = getDisplayName(fight.fighterB, "ru");
  const pick = describeFightPick(fight);
  const verdict = pick ? `${pick.side === "A" ? nameA : nameB}, ${pick.percent}%` : "пик позже";
  return `• ${nameA} — ${nameB} → ${verdict}`;
}

function formatValuePickLines(fights: TelegramPicksFight[]) {
  return fights.flatMap((fight) => {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot) return [];
    const valuePick = resolveValuePick({
      aiWinChanceA: snapshot.aiWinChanceA,
      oddsAAtPick: snapshot.oddsAAtPick,
      oddsBAtPick: snapshot.oddsBAtPick,
      fighterAId: fight.fighterAId,
      fighterBId: fight.fighterBId
    });
    if (!valuePick) return [];
    const name = getDisplayName(valuePick.side === "A" ? fight.fighterA : fight.fighterB, "ru");
    return [`💎 Ценный выбор: ${name} (кэф ${valuePick.odds.toFixed(2).replace(".", ",")})`];
  });
}

export function buildTelegramPicksPost(event: TelegramPicksEvent, siteUrl: string) {
  const fights = sortFightsForCard(event.fights.filter((fight) => fight.status === "scheduled"));
  const isMainCard = (fight: TelegramPicksFight) => Boolean(fight.isMainEvent) || fight.stage === "main_card";
  const groups: Array<[string, TelegramPicksFight[]]> = [
    ["Основной кард", fights.filter(isMainCard)],
    ["Прелимы", fights.filter((fight) => !isMainCard(fight))]
  ];

  const head = `🥊 Пики ИИ-модели FightBase: ${event.name}\n${formatEventDateLine(event)}`;
  const cardBlocks = groups
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => [title, ...list.map(formatFightLine)].join("\n"));
  const link = `Все разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`;
  const compose = (valueLines: string[]) =>
    [head, ...cardBlocks, ...(valueLines.length > 0 ? [valueLines.join("\n")] : []), link].join("\n\n");

  let valueLines = formatValuePickLines(fights);
  let text = compose(valueLines);
  while (text.length > TELEGRAM_TEXT_MAX && valueLines.length > 0) {
    valueLines = valueLines.slice(0, -1);
    text = compose(valueLines);
  }
  return text.length > TELEGRAM_TEXT_MAX ? `${text.slice(0, TELEGRAM_TEXT_MAX - 1).trimEnd()}…` : text;
}
