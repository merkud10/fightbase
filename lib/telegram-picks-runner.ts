// Исполнение постов ИИ-модели в Telegram-канале (решение и текст — lib/telegram-picks.ts).
// Каждый прогон сначала публикует итоги прошедших турниров ответом на их пост с
// пиками, затем ведёт пост с пиками ближайшего: отправка, правка до начала турнира,
// закреп нового поста и снятие закрепа с прошлого. Id сообщений сохраняются сразу
// после отправки, поэтому сбой закрепа или записи не приводит к повторной отправке.

import { createHash } from "node:crypto";

import { getPredictionAccuracy } from "@/lib/db/events";
import { isContenderSeries } from "@/lib/event-results";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getTelegramApiBase } from "@/lib/social-publish";
import { recordSystemEvent } from "@/lib/system-events";
import {
  buildTelegramPicksPost,
  buildTelegramResultsPost,
  decideTelegramPicksAction,
  decideTelegramResultsAction,
  type TelegramPicksAction,
  type TelegramPicksEvent,
  type TelegramResultsAccuracy,
  type TelegramResultsAction
} from "@/lib/telegram-picks";

export type TelegramResultsRun = {
  action: TelegramResultsAction | "skipped";
  eventSlug: string;
  text?: string;
  messageId?: number;
};

export type TelegramPicksRunResult = {
  action: TelegramPicksAction | "none" | "skipped";
  eventSlug?: string;
  reason?: string;
  text?: string;
  messageId?: number;
  changed?: boolean;
  pinned?: boolean;
  unpinned?: number;
  results?: TelegramResultsRun[];
  resultsError?: string;
};

class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string
  ) {
    super(`Telegram ${method}: ${status} ${description}`);
  }
}

const fighterSelect = { id: true, name: true, nameRu: true } as const;

const eventSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  date: true,
  earlyPrelimsAt: true,
  prelimsAt: true,
  mainCardAt: true,
  fights: {
    select: {
      id: true,
      stage: true,
      boutOrder: true,
      isMainEvent: true,
      createdAt: true,
      status: true,
      resultType: true,
      winnerFighterId: true,
      fighterAId: true,
      fighterBId: true,
      fighterA: { select: fighterSelect },
      fighterB: { select: fighterSelect },
      predictionSnapshot: {
        select: {
          aiPickFighterId: true,
          percentA: true,
          percentB: true,
          aiWinChanceA: true,
          oddsAAtPick: true,
          oddsBAtPick: true
        }
      }
    }
  }
} as const;

async function loadNextEvent(): Promise<TelegramPicksEvent | null> {
  const events = await prisma.event.findMany({
    where: { status: "upcoming" },
    orderBy: { date: "asc" },
    take: 5,
    select: eventSelect
  });
  return events.find((event) => !isContenderSeries(event.name)) ?? null;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

// Флаг стоит только в .env на сервере: локальный .env содержит тот же токен и
// канал, а адрес сайта и при локальном запуске — https://fightbase.ru.
function resolveChatId() {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  return process.env.TELEGRAM_PICKS_ENABLED === "1" && process.env.TELEGRAM_BOT_TOKEN && chatId ? chatId : null;
}

async function callBot(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${getTelegramApiBase()}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new TelegramApiError(method, response.status, payload?.description ?? "");
  }
  return payload.result;
}

async function editPostText(chatId: string, messageId: number, text: string) {
  try {
    await callBot("editMessageText", { chat_id: chatId, message_id: messageId, text, link_preview_options: { is_disabled: true } });
  } catch (error) {
    // Текст в Telegram уже такой (например, прошлая правка прошла, а запись в базу — нет).
    if (error instanceof TelegramApiError && error.description.includes("message is not modified")) return;
    throw error;
  }
}

async function pinAndReleasePrevious(chatId: string, eventId: string, messageId: number) {
  await callBot("pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
  await prisma.telegramEventPost.update({ where: { eventId }, data: { pinnedAt: new Date() } });

  const previous = await prisma.telegramEventPost.findMany({ where: { eventId: { not: eventId }, unpinnedAt: null } });
  for (const post of previous) {
    try {
      await callBot("unpinChatMessage", { chat_id: chatId, message_id: post.messageId });
    } catch (error) {
      // 400 — сообщение уже не закреплено или удалено руками; снимать нечего.
      if (!(error instanceof TelegramApiError && error.status === 400)) throw error;
    }
    await prisma.telegramEventPost.update({ where: { eventId: post.eventId }, data: { unpinnedAt: new Date() } });
  }
  return { pinned: true, unpinned: previous.length };
}

// Итоги публикуются только для турниров, у которых в канале уже есть пост с пиками.
async function runResultsStep({
  now,
  dryRun,
  siteUrl,
  chatId
}: {
  now: Date;
  dryRun: boolean;
  siteUrl: string;
  chatId: string | null;
}): Promise<Pick<TelegramPicksRunResult, "results" | "resultsError">> {
  const pending = await prisma.telegramEventPost.findMany({
    where: { resultsPostedAt: null },
    select: { eventId: true, messageId: true }
  });
  const results: TelegramResultsRun[] = [];
  let accuracy: TelegramResultsAccuracy | null = null;

  for (const post of pending) {
    const event = await prisma.event.findUnique({ where: { id: post.eventId }, select: eventSelect });
    if (!event) continue;
    const action = decideTelegramResultsAction({ event, hasResultsPost: false, now });
    if (action !== "post") {
      results.push({ action, eventSlug: event.slug });
      continue;
    }

    accuracy ??= await getPredictionAccuracy();
    const text = buildTelegramResultsPost(event, accuracy, siteUrl);
    if (dryRun) {
      results.push({ action, eventSlug: event.slug, text });
      continue;
    }
    if (!chatId) {
      results.push({ action: "skipped", eventSlug: event.slug });
      continue;
    }

    try {
      const sent = (await callBot("sendMessage", {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: post.messageId, allow_sending_without_reply: true }
      })) as { message_id: number };
      await prisma.telegramEventPost.update({
        where: { eventId: event.id },
        data: { resultsMessageId: sent.message_id, resultsPostedAt: new Date() }
      });
      results.push({ action, eventSlug: event.slug, messageId: sent.message_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordSystemEvent({
        level: "error",
        category: "telegram.results",
        message,
        source: "api/cron/telegram-picks",
        meta: { eventSlug: event.slug }
      });
      return { results, resultsError: message };
    }
  }

  return { results };
}

async function runPicksStep({
  now,
  dryRun,
  siteUrl,
  chatId
}: {
  now: Date;
  dryRun: boolean;
  siteUrl: string;
  chatId: string | null;
}): Promise<TelegramPicksRunResult> {
  const event = await loadNextEvent();
  if (!event) return { action: "none" };

  const post = await prisma.telegramEventPost.findUnique({ where: { eventId: event.id } });
  const action = decideTelegramPicksAction({ event, hasPost: Boolean(post), now });
  const text = buildTelegramPicksPost(event, siteUrl);
  const base = { action, eventSlug: event.slug };
  if (dryRun) return { ...base, text };
  if (!chatId) {
    return { action: "skipped", eventSlug: event.slug, reason: "TELEGRAM_PICKS_ENABLED is off or Telegram is not configured" };
  }

  try {
    if (action === "post") {
      const sent = (await callBot("sendMessage", {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true }
      })) as { message_id: number };
      await prisma.telegramEventPost.create({ data: { eventId: event.id, messageId: sent.message_id, textHash: hashText(text) } });
      return { ...base, messageId: sent.message_id, ...(await pinAndReleasePrevious(chatId, event.id, sent.message_id)) };
    }

    if (action === "edit" && post) {
      const changed = post.textHash !== hashText(text);
      if (changed) {
        await editPostText(chatId, post.messageId, text);
        await prisma.telegramEventPost.update({ where: { eventId: event.id }, data: { textHash: hashText(text) } });
      }
      const pin = post.pinnedAt ? {} : await pinAndReleasePrevious(chatId, event.id, post.messageId);
      return { ...base, messageId: post.messageId, changed, ...pin };
    }

    return base;
  } catch (error) {
    await recordSystemEvent({
      level: "error",
      category: "telegram.picks",
      message: error instanceof Error ? error.message : String(error),
      source: "api/cron/telegram-picks",
      meta: { eventSlug: event.slug, action }
    });
    throw error;
  }
}

export async function runTelegramPicks({ now = new Date(), dryRun = false } = {}): Promise<TelegramPicksRunResult> {
  const options = { now, dryRun, siteUrl: getSiteUrl().toString().replace(/\/$/, ""), chatId: resolveChatId() };
  // Ошибка итогов не мешает посту с пиками: она уже записана в системные события.
  const results = await runResultsStep(options);
  return { ...(await runPicksStep(options)), ...results };
}
