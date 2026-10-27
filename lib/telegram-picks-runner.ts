// Исполнение поста с пиками в Telegram-канале (решение и текст — lib/telegram-picks.ts):
// отправка, правка до начала турнира, закреп нового поста и снятие закрепа с прошлого.
// Запись о посте сохраняется сразу после отправки, поэтому сбой закрепа не приводит
// к повторной отправке: закреп повторится на следующем запуске.

import { createHash } from "node:crypto";

import { isContenderSeries } from "@/lib/event-results";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getTelegramApiBase } from "@/lib/social-publish";
import { recordSystemEvent } from "@/lib/system-events";
import {
  buildTelegramPicksPost,
  decideTelegramPicksAction,
  type TelegramPicksAction,
  type TelegramPicksEvent
} from "@/lib/telegram-picks";

export type TelegramPicksRunResult = {
  action: TelegramPicksAction | "none" | "skipped";
  eventSlug?: string;
  reason?: string;
  text?: string;
  messageId?: number;
  changed?: boolean;
  pinned?: boolean;
  unpinned?: number;
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

async function loadNextEvent(): Promise<TelegramPicksEvent | null> {
  const events = await prisma.event.findMany({
    where: { status: "upcoming" },
    orderBy: { date: "asc" },
    take: 5,
    select: {
      id: true,
      slug: true,
      name: true,
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
    }
  });
  return events.find((event) => !isContenderSeries(event.name)) ?? null;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
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

export async function runTelegramPicks({ now = new Date(), dryRun = false } = {}): Promise<TelegramPicksRunResult> {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const event = await loadNextEvent();
  if (!event) return { action: "none" };

  const post = await prisma.telegramEventPost.findUnique({ where: { eventId: event.id } });
  const action = decideTelegramPicksAction({ event, hasPost: Boolean(post), now });
  const text = buildTelegramPicksPost(event, siteUrl);
  const base = { action, eventSlug: event.slug };
  if (dryRun) return { ...base, text };

  // Флаг стоит только в .env на сервере: локальный .env содержит тот же токен и
  // канал, а адрес сайта и при локальном запуске — https://fightbase.ru.
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (process.env.TELEGRAM_PICKS_ENABLED !== "1" || !process.env.TELEGRAM_BOT_TOKEN || !chatId) {
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
