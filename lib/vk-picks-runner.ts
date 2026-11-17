// Посты ИИ-модели в сообществе VK — то же, что lib/telegram-picks-runner.ts делает
// в Telegram: пост с пиками ближайшего турнира, правка до его начала, закреп, а после
// турнира — пост с итогами и картинкой-сводкой. Решения и тексты общие с Telegram
// (lib/telegram-picks.ts), отличается только метка канала в ссылке.
//
// Пост пишется ключом сообщества. Правку и закреп VK разрешает не всякому ключу,
// поэтому при отказе запрос повторяется ключом администратора (VK_USER_TOKEN).

import { getPredictionAccuracy } from "@/lib/db/events";
import { buildModelSummary } from "@/lib/model-summary";
import { renderModelSummaryPng } from "@/lib/model-summary-image";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { vkApiMethodPost, vkUploadWallPhoto, vkWallPost } from "@/lib/social-publish";
import { recordSystemEvent } from "@/lib/system-events";
import {
  buildEventPageUrl,
  buildTelegramPicksPost,
  buildTelegramResultsPost,
  decideTelegramPicksAction,
  decideTelegramResultsAction,
  type TelegramPicksAction,
  type TelegramResultsAction
} from "@/lib/telegram-picks";
import { hashText, loadNextPicksEvent, picksEventSelect } from "@/lib/telegram-picks-runner";

export type VkResultsRun = {
  action: TelegramResultsAction | "skipped";
  eventSlug: string;
  text?: string;
  postId?: number;
  withImage?: boolean;
};

export type VkPicksRunResult = {
  action: TelegramPicksAction | "none" | "skipped";
  eventSlug?: string;
  reason?: string;
  text?: string;
  postId?: number;
  changed?: boolean;
  pinned?: boolean;
  results?: VkResultsRun[];
  resultsError?: string;
};

type VkConfig = { groupToken: string; userToken: string; groupId: string; apiVersion: string };

// Закреп пробуем только первые часы после публикации: если VK его не разрешает,
// незачем писать одну и ту же ошибку каждый час до самого турнира.
const PIN_RETRY_HOURS = 3;

// Флаг стоит только в .env на сервере: в локальном .env те же ключи сообщества.
function resolveVkConfig(): VkConfig | null {
  const groupToken = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  if (process.env.VK_PICKS_ENABLED !== "1" || !groupToken || !groupId) return null;
  return {
    groupToken,
    userToken: process.env.VK_USER_TOKEN || groupToken,
    groupId: groupId.replace(/^-+/, ""),
    apiVersion: process.env.VK_API_VERSION || "5.199"
  };
}

// Ответ VK с ошибкой (в отличие от сбоя сети): запрос точно не выполнен, повтор безопасен.
function isVkApiError(error: unknown) {
  return error instanceof Error && error.message.includes("(VK error");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function callWithTokenFallback<T>(config: VkConfig, call: (token: string) => Promise<T>) {
  try {
    return await call(config.groupToken);
  } catch (error) {
    if (!isVkApiError(error) || config.userToken === config.groupToken) throw error;
    return call(config.userToken);
  }
}

// Ссылка-вложение даёт карточку страницы под текстом. Если VK её не принял, пост идёт без неё.
async function postWithLink(config: VkConfig, text: string, linkUrl: string) {
  try {
    return await vkWallPost(config.groupToken, config.apiVersion, config.groupId, text, linkUrl);
  } catch (error) {
    if (!isVkApiError(error)) throw error;
    return vkWallPost(config.groupToken, config.apiVersion, config.groupId, text);
  }
}

async function editPost(config: VkConfig, postId: number, text: string, linkUrl: string) {
  const edit = (attachments?: string) =>
    callWithTokenFallback(config, (token) =>
      vkApiMethodPost("wall.edit", {
        access_token: token,
        v: config.apiVersion,
        owner_id: `-${config.groupId}`,
        post_id: postId,
        message: text,
        ...(attachments ? { attachments } : {})
      })
    );
  try {
    await edit(linkUrl);
  } catch (error) {
    if (!isVkApiError(error)) throw error;
    await edit();
  }
}

// Закреп не обязателен: его отказ записывается предупреждением и не роняет прогон.
// Прошлый закреплённый пост VK открепляет сам — закреп на стене один.
async function pinPost(config: VkConfig, eventId: string, eventSlug: string, postId: number) {
  try {
    await callWithTokenFallback(config, (token) =>
      vkApiMethodPost("wall.pin", { access_token: token, v: config.apiVersion, owner_id: `-${config.groupId}`, post_id: postId })
    );
    await prisma.vkEventPost.update({ where: { eventId }, data: { pinnedAt: new Date() } });
    return true;
  } catch (error) {
    await recordSystemEvent({
      level: "warn",
      category: "vk.picks",
      message: `Закрепить пост не удалось: ${errorMessage(error)}`,
      source: "api/cron/telegram-picks",
      meta: { eventSlug, postId }
    });
    return false;
  }
}

type RunOptions = { now: Date; dryRun: boolean; siteUrl: string; config: VkConfig | null };

// Итоги публикуются только для турниров, у которых в сообществе уже есть пост с пиками.
async function runResultsStep({ now, dryRun, siteUrl, config }: RunOptions): Promise<Pick<VkPicksRunResult, "results" | "resultsError">> {
  const pending = await prisma.vkEventPost.findMany({ where: { resultsPostedAt: null }, select: { eventId: true } });
  const results: VkResultsRun[] = [];
  let accuracy: Awaited<ReturnType<typeof getPredictionAccuracy>> | null = null;

  for (const post of pending) {
    const event = await prisma.event.findUnique({ where: { id: post.eventId }, select: picksEventSelect });
    if (!event) continue;
    const action = decideTelegramResultsAction({ event, hasResultsPost: false, now });
    if (action !== "post") {
      results.push({ action, eventSlug: event.slug });
      continue;
    }

    accuracy ??= await getPredictionAccuracy();
    const text = buildTelegramResultsPost(event, accuracy, siteUrl, "vk");
    if (dryRun) {
      results.push({ action, eventSlug: event.slug, text });
      continue;
    }
    if (!config) {
      results.push({ action: "skipped", eventSlug: event.slug });
      continue;
    }

    try {
      // Без картинки итоги всё равно выходят: текст самодостаточен.
      let attachment: string | undefined;
      try {
        // Без единого засчитанного пика картинка пустая — её не прикладываем.
        const summary = buildModelSummary(event, accuracy);
        if (summary.model.judged > 0) {
          const png = await renderModelSummaryPng(summary);
          attachment = await vkUploadWallPhoto(config.userToken, config.apiVersion, config.groupId, png, "image/png", `summary:${event.slug}`);
        }
      } catch (error) {
        await recordSystemEvent({
          level: "warn",
          category: "vk.results",
          message: `Картинка-сводка не приложена: ${errorMessage(error)}`,
          source: "api/cron/telegram-picks",
          meta: { eventSlug: event.slug }
        });
      }

      const sent = await vkWallPost(config.groupToken, config.apiVersion, config.groupId, text, attachment);
      if (!sent?.post_id) throw new Error("VK wall.post вернул ответ без post_id");
      await prisma.vkEventPost.update({
        where: { eventId: event.id },
        data: { resultsPostId: sent.post_id, resultsPostedAt: new Date() }
      });
      results.push({ action, eventSlug: event.slug, postId: sent.post_id, withImage: Boolean(attachment) });
    } catch (error) {
      const message = errorMessage(error);
      await recordSystemEvent({
        level: "error",
        category: "vk.results",
        message,
        source: "api/cron/telegram-picks",
        meta: { eventSlug: event.slug }
      });
      return { results, resultsError: message };
    }
  }

  return { results };
}

async function runPicksStep({ now, dryRun, siteUrl, config }: RunOptions): Promise<VkPicksRunResult> {
  const event = await loadNextPicksEvent();
  if (!event) return { action: "none" };

  const post = await prisma.vkEventPost.findUnique({ where: { eventId: event.id } });
  const action = decideTelegramPicksAction({ event, hasPost: Boolean(post), now });
  const text = buildTelegramPicksPost(event, siteUrl, "vk");
  const linkUrl = buildEventPageUrl(event, siteUrl, "vk", "event_picks");
  const base = { action, eventSlug: event.slug };
  if (dryRun) return { ...base, text };
  if (!config) {
    return { action: "skipped", eventSlug: event.slug, reason: "VK_PICKS_ENABLED is off or VK is not configured" };
  }

  try {
    if (action === "post") {
      const sent = await postWithLink(config, text, linkUrl);
      if (!sent?.post_id) throw new Error("VK wall.post вернул ответ без post_id");
      await prisma.vkEventPost.create({ data: { eventId: event.id, postId: sent.post_id, textHash: hashText(text) } });
      return { ...base, postId: sent.post_id, pinned: await pinPost(config, event.id, event.slug, sent.post_id) };
    }

    if (action === "edit" && post) {
      const changed = post.textHash !== hashText(text);
      if (changed) {
        await editPost(config, post.postId, text, linkUrl);
        await prisma.vkEventPost.update({ where: { eventId: event.id }, data: { textHash: hashText(text) } });
      }
      const pinDue = !post.pinnedAt && now.getTime() - post.postedAt.getTime() < PIN_RETRY_HOURS * 3_600_000;
      return { ...base, postId: post.postId, changed, ...(pinDue ? { pinned: await pinPost(config, event.id, event.slug, post.postId) } : {}) };
    }

    return base;
  } catch (error) {
    await recordSystemEvent({
      level: "error",
      category: "vk.picks",
      message: errorMessage(error),
      source: "api/cron/telegram-picks",
      meta: { eventSlug: event.slug, action }
    });
    throw error;
  }
}

export async function runVkPicks({ now = new Date(), dryRun = false } = {}): Promise<VkPicksRunResult> {
  const options = { now, dryRun, siteUrl: getSiteUrl().toString().replace(/\/$/, ""), config: resolveVkConfig() };
  // Ошибка итогов не мешает посту с пиками: она уже записана в системные события.
  const results = await runResultsStep(options);
  return { ...(await runPicksStep(options)), ...results };
}
