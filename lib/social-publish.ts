import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { TELEGRAM_DIGEST_MAX } from "@/lib/ai-localization";
import { buildPublicArticleImageWhere, hasRenderablePublicArticleImage } from "@/lib/db/articles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

type PublishTarget = "telegram" | "vk";
const SOCIAL_PUBLISH_TIME_ZONE = process.env.SOCIAL_PUBLISH_TIME_ZONE || "Europe/Moscow";

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  ) - date.getTime();
}

function getTodayPublishWindow(timeZone: string): { start: Date; end: Date } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  const tomorrowStart = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  const yesterdayStart = new Date(Date.UTC(year, month - 1, day - 1, 0, 0, 0, 0));

  return {
    start: new Date(yesterdayStart.getTime() - getTimeZoneOffsetMs(yesterdayStart, timeZone)),
    end: new Date(tomorrowStart.getTime() - getTimeZoneOffsetMs(tomorrowStart, timeZone))
  };
}

/** Telegram Bot API: максимум ~4096 символов на сообщение (UTF-16). */
const TELEGRAM_MESSAGE_MAX = 4090;

/** VK wall.post: лимит текста (с запасом). */
const VK_MESSAGE_MAX = 65000;

const GENERIC_SECTION_HEADINGS = new Set(["ai draft", "main section", "основной раздел"]);

function escapeTelegram(value: string) {
  return String(value || "").replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}

type ArticleSocialPayload = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  category: string;
  status: string;
  telegramPostedAt: Date | null;
  vkPostedAt: Date | null;
  meaning: string;
  sections: { heading: string; body: string; sortOrder: number }[];
  telegramDigest: string | null;
};

export async function getPublishableArticle(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      category: true,
      status: true,
      telegramPostedAt: true,
      vkPostedAt: true,
      coverImageUrl: true,
      meaning: true,
      telegramDigest: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { heading: true, body: true, sortOrder: true }
      }
    }
  });
}

/**
 * Возвращает абсолютный URL картинки для Telegram/VK.
 * Относительный `/api/image-proxy?...` приводится к публичному URL сайта (как в UI).
 * Внешние https URL остаются как есть — дальше downloadImageBuffer может подставить тот же proxy.
 */
function resolveCoverImageUrlForSocial(raw: string | null | undefined): string | null {
  const url = String(raw || "").trim();
  if (!url) {
    return null;
  }

  if (url.startsWith("/api/image-proxy") || url.startsWith("/media/")) {
    return `${getSiteUrl().origin}${url}`;
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }

  return null;
}

type VkErrorBody = { error_msg?: string; error_code?: number };

function formatVkApiError(method: string, error: VkErrorBody): string {
  const code = error.error_code;
  const msg = error.error_msg || `VK ${method} failed`;
  const codeStr = code != null ? String(code) : "?";
  const permissionHint =
    code === 5 || code === 7 || code === 15 || code === 200
      ? " Проверьте VK_GROUP_TOKEN: для фото и поста нужны scope wall и photos."
      : code === 27
        ? " VK считает этот токен group auth для загрузки wall photo. Нужен user OAuth token администратора сообщества со scope wall, photos, offline."
      : "";
  return `${msg} (VK error ${codeStr})${permissionHint}`;
}

/** Telegram sendPhoto caption limit: 1024 chars */
const TELEGRAM_CAPTION_MAX = 1020;

function resolveLocalMediaPath(mediaUrl: string): string | null {
  if (!mediaUrl.startsWith("/media/")) return null;
  const appRoot = process.env.APP_ROOT || process.cwd();
  const filePath = path.join(appRoot, "public", mediaUrl.replace(/^\//, ""));
  return existsSync(filePath) ? filePath : null;
}

async function telegramSendPhotoFile(
  apiUrl: string,
  chatId: string,
  filePath: string,
  caption?: string,
  parseMode?: "HTML"
) {
  const fileBuffer = await readFile(filePath);
  const ext = path.extname(filePath).replace(/^\./, "") || "jpg";
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([fileBuffer], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }), `photo.${ext}`);
  if (caption) {
    form.append("caption", caption);
    if (parseMode) form.append("parse_mode", parseMode);
  }

  const response = await fetch(apiUrl, { method: "POST", body: form });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Telegram sendPhoto (file): ${response.status} ${errBody}`);
  }
}

async function telegramSendPhotoUrl(
  apiUrl: string,
  chatId: string,
  photoUrl: string,
  caption?: string,
  parseMode?: "HTML"
) {
  const payload: Record<string, string> = { chat_id: chatId, photo: photoUrl };
  if (caption) {
    payload.caption = caption;
    if (parseMode) payload.parse_mode = parseMode;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Telegram sendPhoto (url): ${response.status} ${errBody}`);
  }
}

function getTelegramApiBase(): string {
  return (process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org").replace(/\/+$/, "");
}

/**
 * Telegram и VK не принимают AVIF/WebP — конвертируем в JPEG через wsrv.nl.
 * publicImageUrl — публичный URL картинки (нужен wsrv.nl для скачивания).
 */
async function convertToJpegIfNeeded(
  rawBuffer: Buffer,
  rawContentType: string,
  publicImageUrl: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (rawContentType !== "image/avif" && rawContentType !== "image/webp") {
    return { buffer: rawBuffer, contentType: rawContentType };
  }

  const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(publicImageUrl)}&output=jpg&w=1200`;
  try {
    const res = await fetch(wsrvUrl, { redirect: "follow" });
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/")) {
        return { buffer: Buffer.from(await res.arrayBuffer()), contentType: "image/jpeg" };
      }
    }
  } catch {
    // fallback to original buffer
  }

  return { buffer: rawBuffer, contentType: rawContentType };
}

async function telegramSendPhoto(
  token: string,
  chatId: string,
  coverImageUrl: string,
  caption?: string,
  parseMode: "HTML" | undefined = "HTML"
) {
  const apiUrl = `${getTelegramApiBase()}/bot${token}/sendPhoto`;
  const localPath = resolveLocalMediaPath(coverImageUrl);

  if (localPath) {
    const ext = path.extname(localPath).replace(/^\./, "").toLowerCase();
    const rawContentType = ext === "avif" ? "image/avif" : ext === "webp" ? "image/webp" : null;
    if (rawContentType) {
      const publicUrl = `${getSiteUrl().origin}${coverImageUrl}`;
      const { buffer, contentType } = await convertToJpegIfNeeded(
        await readFile(localPath),
        rawContentType,
        publicUrl
      );
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("photo", new Blob([buffer], { type: contentType }), "photo.jpg");
      if (caption) {
        form.append("caption", caption);
        if (parseMode) form.append("parse_mode", parseMode);
      }
      const res = await fetch(apiUrl, { method: "POST", body: form });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Telegram sendPhoto (converted): ${res.status} ${errBody}`);
      }
      return;
    }
    await telegramSendPhotoFile(apiUrl, chatId, localPath, caption, parseMode);
    return;
  }

  const fullUrl = coverImageUrl.startsWith("/media/") || coverImageUrl.startsWith("/api/")
    ? `${getSiteUrl().origin}${coverImageUrl}`
    : coverImageUrl;

  await telegramSendPhotoUrl(apiUrl, chatId, fullUrl, caption, parseMode);
}

type VkSavedPhoto = { id: number; owner_id: number };
type VkWallUploadResponse = {
  server?: string | number;
  photo?: string;
  photos_list?: string;
  hash?: string;
};

async function vkApiMethod<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`https://api.vk.com/method/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  const json = (await response.json()) as { response?: T; error?: VkErrorBody };

  if (json.error) {
    throw new Error(formatVkApiError(method, json.error));
  }

  return json.response as T;
}

async function vkApiMethodPost<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const json = (await response.json()) as { response?: T; error?: VkErrorBody };

  if (json.error) {
    throw new Error(formatVkApiError(method, json.error));
  }

  return json.response as T;
}

function parseVkUploadResponse(rawBody: string): { server: string | number; photo: string; hash: string } {
  let json: VkWallUploadResponse;
  try {
    json = JSON.parse(rawBody) as VkWallUploadResponse;
  } catch {
    throw new Error(`VK upload server returned invalid JSON: ${rawBody.slice(0, 300)}`);
  }

  const photo = typeof json.photo === "string" && json.photo.trim()
    ? json.photo
    : typeof json.photos_list === "string" && json.photos_list.trim()
      ? json.photos_list
      : "";

  if (!json.server || !photo || !json.hash) {
    throw new Error(`VK upload server returned unexpected payload: ${rawBody.slice(0, 500)}`);
  }

  return {
    server: json.server,
    photo,
    hash: json.hash
  };
}

/**
 * Сначала — запрос к своему `/api/image-proxy` для внешних URL (как в браузере: Referer к UFC/Sherdog).
 * Затем прямой URL, wsrv.nl и images.weserv.nl.
 */
function buildImageDownloadCandidates(imageUrl: string): string[] {
  const trimmed = imageUrl.trim();
  const origin = getSiteUrl().origin;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return [trimmed];
  }

  if (parsed.pathname.startsWith("/api/image-proxy") && parsed.origin === origin) {
    return [trimmed];
  }

  const isExternal = (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== origin;
  const ordered: string[] = [];
  if (isExternal) {
    ordered.push(`${origin}/api/image-proxy?url=${encodeURIComponent(trimmed)}`);
  }
  ordered.push(trimmed);
  return [...new Set(ordered)];
}

/**
 * Пробует скачать изображение по URL. Если прямой запрос не удался (403 и т.д.),
 * пытается через wsrv.nl — внешний прокси, обходящий CDN-блокировки.
 */
async function downloadImageBufferSingle(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const fetchHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
  };

  try {
    const imgHost = new URL(imageUrl).hostname;
    if (imgHost.includes("ufc.com") || imgHost.includes("ufc.tv")) {
      fetchHeaders["Referer"] = "https://www.ufc.com/";
    } else if (imgHost.includes("sherdog.com")) {
      fetchHeaders["Referer"] = "https://www.sherdog.com/";
    }
  } catch { /* invalid URL — let fetch handle it */ }

  // Attempt 1: direct fetch
  const directRes = await fetch(imageUrl, { redirect: "follow", headers: fetchHeaders });

  if (directRes.ok) {
    const ct = directRes.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return { buffer: Buffer.from(await directRes.arrayBuffer()), contentType: ct };
    }
  }

  console.log(`[VK] Direct download failed (${directRes.status}), trying wsrv.nl proxy for: ${imageUrl}`);

  // Attempt 2: wsrv.nl proxy (bypasses many CDN restrictions)
  const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&default=1`;
  const proxyRes = await fetch(wsrvUrl, { redirect: "follow" });

  if (proxyRes.ok) {
    const ct = proxyRes.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return { buffer: Buffer.from(await proxyRes.arrayBuffer()), contentType: ct };
    }
  }

  console.log(`[VK] wsrv.nl proxy also failed (${proxyRes.status}), trying images.weserv.nl`);

  // Attempt 3: images.weserv.nl with different params
  const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=1200&output=jpg`;
  const weservRes = await fetch(weservUrl, { redirect: "follow" });

  if (weservRes.ok) {
    const ct = weservRes.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return { buffer: Buffer.from(await weservRes.arrayBuffer()), contentType: ct };
    }
  }

  throw new Error(`Image download failed from all sources (direct: ${directRes.status}, wsrv: ${proxyRes.status}, weserv: ${weservRes.status})`);
}

async function downloadImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const localPath = resolveLocalMediaPath(imageUrl);
  if (localPath) {
    const buffer = await readFile(localPath);
    const ext = path.extname(localPath).replace(/^\./, "").toLowerCase();
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
    return { buffer, contentType: mimeMap[ext] || "image/jpeg" };
  }

  const candidates = buildImageDownloadCandidates(imageUrl);
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return await downloadImageBufferSingle(candidate);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log(`[VK] Image candidate failed (${candidate.slice(0, 120)}…): ${lastError.message}`);
    }
  }
  throw lastError ?? new Error("Image download failed");
}

/**
 * Загружает изображение по URL на стену группы VK и возвращает строку вложения для wall.post.
 */
async function vkUploadWallPhotoFromUrl(
  token: string,
  apiVersion: string,
  groupId: string,
  imageUrl: string
): Promise<string> {
  const gid = String(groupId).replace(/^-+/, "");
  const downloaded = await downloadImageBuffer(imageUrl);
  const { buffer, contentType } = await convertToJpegIfNeeded(downloaded.buffer, downloaded.contentType, imageUrl);
  const ext = contentType.includes("png") ? "png" : "jpeg";
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const uploadPayload = await vkApiMethod<{ upload_url: string }>("photos.getWallUploadServer", {
        access_token: token,
        v: apiVersion,
        group_id: gid
      });

      const form = new FormData();
      form.append("photo", new Blob([buffer], { type: contentType }), `cover.${ext}`);

      const uploadRes = await fetch(uploadPayload.upload_url, {
        method: "POST",
        body: form
      });

      const uploadRaw = await uploadRes.text();
      const uploadJson = parseVkUploadResponse(uploadRaw);

      const saved = await vkApiMethodPost<VkSavedPhoto[]>("photos.saveWallPhoto", {
        access_token: token,
        v: apiVersion,
        group_id: gid,
        server: uploadJson.server,
        photo: uploadJson.photo,
        hash: uploadJson.hash
      });

      const ph = saved[0];
      if (!ph) {
        throw new Error("VK photos.saveWallPhoto returned empty array");
      }

      return `photo${ph.owner_id}_${ph.id}`;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 2) {
        logger.warn("VK wall photo upload attempt failed, retrying", {
          groupId: gid,
          imageUrl,
          attempt,
          message: lastError.message
        });
        continue;
      }
    }
  }

  throw lastError ?? new Error("VK photo upload failed");
}

async function vkWallPost(
  token: string,
  apiVersion: string,
  groupId: string,
  message: string,
  attachments?: string
) {
  const gid = String(groupId).replace(/^-+/, "");
  const params = new URLSearchParams();
  params.set("access_token", token);
  params.set("v", apiVersion);
  params.set("owner_id", `-${gid}`);
  params.set("from_group", "1");
  params.set("message", message);
  if (attachments) {
    params.set("attachments", attachments);
  }

  const response = await fetch("https://api.vk.com/method/wall.post", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const json = (await response.json()) as { response?: { post_id?: number }; error?: VkErrorBody };

  if (json.error) {
    throw new Error(formatVkApiError("wall.post", json.error));
  }

  return json.response;
}

/**
 * Разбивает длинные абзацы на короткие (1-2 предложения).
 * Telegram-посты с частыми переносами строк читаются значительно лучше.
 */
function splitIntoShortParagraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .flatMap((para) => {
      const trimmed = para.trim();
      if (!trimmed) return [];
      // Если абзац уже короткий (≤ 200 символов), оставляем как есть
      if (trimmed.length <= 200) return [trimmed];

      // Разбиваем по предложениям (точка/!/? + пробел + заглавная буква или кириллица)
      const sentences = trimmed.match(/[^.!?]*[.!?]+(?:\s|$)/g) || [trimmed];
      const shortParas: string[] = [];
      let current = "";

      for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;

        if (current && (current + " " + s).length > 200) {
          shortParas.push(current.trim());
          current = s;
        } else {
          current = current ? current + " " + s : s;
        }
      }
      if (current.trim()) {
        shortParas.push(current.trim());
      }

      return shortParas.length > 0 ? shortParas : [trimmed];
    })
    .join("\n\n");
}

function composeFullArticlePlainText(article: Pick<ArticleSocialPayload, "title" | "excerpt" | "meaning" | "sections">): string {
  const blocks: string[] = [];
  const title = String(article.title || "").trim();
  if (title) {
    blocks.push(title);
  }

  for (const section of article.sections) {
    const heading = String(section.heading || "").trim();
    const body = String(section.body || "").trim();
    const generic = GENERIC_SECTION_HEADINGS.has(heading.toLowerCase());
    if (!body && !heading) {
      continue;
    }
    blocks.push("");
    if (heading && !generic) {
      blocks.push(heading);
      blocks.push("");
    }
    if (body) {
      blocks.push(body);
    }
  }

  let composed = blocks.join("\n").trim();
  const excerpt = String(article.excerpt || "").trim();
  const hasSubstance = composed.length > title.length + 30;
  if (!hasSubstance && excerpt) {
    composed = [title, "", excerpt].filter(Boolean).join("\n").trim();
  }

  return composed;
}

/** Версия текста для Telegram — с короткими абзацами. */
function composeTelegramText(article: Pick<ArticleSocialPayload, "title" | "excerpt" | "meaning" | "sections">): string {
  return splitIntoShortParagraphs(composeFullArticlePlainText(article));
}

/** Режет текст на части по границам абзацев, чтобы уместиться в лимит Telegram. */
function splitTextForTelegramChunks(fullText: string, maxLen: number): string[] {
  const text = fullText.trim();
  if (text.length <= maxLen) {
    return [text];
  }

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      chunks.push(rest.trim());
      break;
    }

    let slice = rest.slice(0, maxLen);
    const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    if (breakAt > maxLen * 0.5) {
      slice = rest.slice(0, breakAt);
    }

    chunks.push(slice.trim());
    rest = rest.slice(slice.length).trimStart();
  }

  return chunks.filter(Boolean);
}

function buildTelegramHtmlChunks(article: ArticleSocialPayload): string[] {
  const fullText = composeTelegramText(article);
  const plainChunks = splitTextForTelegramChunks(fullText, TELEGRAM_MESSAGE_MAX);

  return plainChunks.map((chunk, index) => {
    if (index === 0) {
      const lines = chunk.split("\n");
      const firstLine = lines[0]?.trim() ?? "";
      const rest = lines.slice(1).join("\n").trim();
      const titleLine = firstLine || article.title.trim();
      const bodyRest = rest || (firstLine ? "" : chunk);

      if (bodyRest.length > 0) {
        return `<b>${escapeTelegram(titleLine)}</b>\n\n${escapeTelegram(bodyRest)}`;
      }

      return `<b>${escapeTelegram(titleLine)}</b>`;
    }

    return escapeTelegram(chunk);
  });
}

/** Один пост для TG из DeepSeek-digest; лимит 1024 символа (как в TELEGRAM_DIGEST_MAX). */
function clampPlainTelegramDigest(text: string): string {
  const t = text.trim();
  if (t.length <= TELEGRAM_DIGEST_MAX) {
    return t;
  }
  return `${t.slice(0, TELEGRAM_DIGEST_MAX - 1).trimEnd()}…`;
}

function buildVkFullMessage(article: ArticleSocialPayload): string {
  const full = composeFullArticlePlainText(article);
  if (full.length <= VK_MESSAGE_MAX) {
    return full;
  }

  return `${full.slice(0, VK_MESSAGE_MAX - 40).trimEnd()}…\n\n[Текст обрезан по лимиту VK API]`;
}

export async function publishArticleToTelegram(articleId: string) {
  const article = await getPublishableArticle(articleId);

  if (!article) {
    throw new Error("Article not found.");
  }

  if (article.status !== "published") {
    throw new Error("Only published articles can be sent to Telegram.");
  }

  if (article.telegramPostedAt) {
    throw new Error("This article has already been sent to Telegram.");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    throw new Error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.");
  }

  const payload = article as ArticleSocialPayload;
  const rawCoverUrl = String(payload.coverImageUrl || "").trim();

  if (!hasRenderablePublicArticleImage(rawCoverUrl)) {
    throw new Error(`Article ${article.id} has no renderable cover image (${rawCoverUrl || "empty"}) — skipping Telegram post.`);
  }

  // Tentative claim: blocks concurrent publishers, but rolled back below if the send fails
  // so transient network/API errors don't permanently consume the article.
  const claimTime = new Date();
  const claim = await prisma.article.updateMany({
    where: { id: article.id, telegramPostedAt: null },
    data: { telegramPostedAt: claimTime }
  });

  if (claim.count === 0) {
    throw new Error(`Article ${article.id} was already claimed for Telegram publish.`);
  }

  try {
    const digest = String(payload.telegramDigest || "").trim();
    const chunks = digest
      ? [clampPlainTelegramDigest(splitIntoShortParagraphs(digest))]
      : buildTelegramHtmlChunks(payload);
    const parseMode: "HTML" | undefined = digest ? undefined : "HTML";
    let startChunkIndex = 0;

    if (chunks.length > 0) {
      const firstChunk = chunks[0] ?? "";
      const captionMax = digest ? TELEGRAM_DIGEST_MAX : TELEGRAM_CAPTION_MAX;
      const caption =
        firstChunk.length <= captionMax ? firstChunk : firstChunk.slice(0, captionMax).trimEnd();
      await telegramSendPhoto(token, chatId, rawCoverUrl, caption, parseMode);
      startChunkIndex = 1;
      if (firstChunk.length > captionMax) {
        chunks[0] = firstChunk.slice(captionMax).trimStart();
        startChunkIndex = 0;
      }
    }

    for (let index = startChunkIndex; index < chunks.length; index += 1) {
      const text = chunks[index] ?? "";
      if (!text.trim()) {
        continue;
      }

      const response = await fetch(`${getTelegramApiBase()}/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(parseMode ? { parse_mode: parseMode } : {}),
          disable_web_page_preview: true
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Telegram API error: ${response.status} ${errBody}`);
      }
    }

    return article;
  } catch (error) {
    // Match on claimTime so we never overwrite a fresher successful claim from another process.
    await prisma.article.updateMany({
      where: { id: article.id, telegramPostedAt: claimTime },
      data: { telegramPostedAt: null }
    });
    throw error;
  }
}

export async function publishArticleToVk(articleId: string) {
  const article = await getPublishableArticle(articleId);

  if (!article) {
    throw new Error("Article not found.");
  }

  if (article.status !== "published") {
    throw new Error("Only published articles can be sent to VK.");
  }

  if (article.vkPostedAt) {
    throw new Error("This article has already been sent to VK.");
  }

  const groupToken = process.env.VK_GROUP_TOKEN;
  const userToken = process.env.VK_USER_TOKEN || groupToken;
  const groupId = process.env.VK_GROUP_ID;
  const apiVersion = process.env.VK_API_VERSION || "5.199";

  if (!groupToken || !groupId) {
    throw new Error("VK is not configured. Set VK_GROUP_TOKEN and VK_GROUP_ID.");
  }

  const payload = article as ArticleSocialPayload;

  if (!hasRenderablePublicArticleImage(payload.coverImageUrl)) {
    throw new Error(`Article ${article.id} has no renderable cover image (${payload.coverImageUrl || "empty"}) — skipping VK post.`);
  }

  const vkMessage = buildVkFullMessage(payload);
  const coverUrl = resolveCoverImageUrlForSocial(payload.coverImageUrl);
  console.log(`[VK] Article ${article.id} | coverImageUrl raw: "${payload.coverImageUrl}" | resolved: "${coverUrl}"`);

  if (!coverUrl) {
    throw new Error(`Article ${article.id} cover image could not be resolved for VK upload.`);
  }

  // Tentative claim: blocks concurrent publishers, but rolled back below if the send fails
  // so transient network/API errors don't permanently consume the article.
  const claimTime = new Date();
  const claim = await prisma.article.updateMany({
    where: { id: article.id, vkPostedAt: null },
    data: { vkPostedAt: claimTime }
  });

  if (claim.count === 0) {
    throw new Error(`Article ${article.id} was already claimed for VK publish.`);
  }

  try {
    const attachment = await vkUploadWallPhotoFromUrl(userToken!, apiVersion, groupId, coverUrl);
    await vkWallPost(groupToken, apiVersion, groupId, vkMessage, attachment);

    return article;
  } catch (error) {
    // Match on claimTime so we never overwrite a fresher successful claim from another process.
    await prisma.article.updateMany({
      where: { id: article.id, vkPostedAt: claimTime },
      data: { vkPostedAt: null }
    });
    throw error;
  }
}

function logAutoPublishError(channel: "telegram" | "vk", articleId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("already been sent")) {
    return;
  }
  if (message.includes("not configured")) {
    logger.info(`Auto-publish skipped (${channel} not configured)`, { articleId });
    return;
  }
  logger.error(`Auto-publish to ${channel} failed`, { articleId, error: message });
}

/**
 * Вызывает публикацию в Telegram и VK для уже опубликованной статьи (если ещё не отправляли).
 * Ошибки отдельных каналов логируются и не прерывают второй канал.
 */
export async function autoPublishArticleToSocialNetworks(articleId: string): Promise<void> {
  const initial = await prisma.article.findUnique({
    where: { id: articleId },
    select: { status: true, telegramPostedAt: true, vkPostedAt: true }
  });

  if (!initial || initial.status !== "published") {
    return;
  }

  if (!initial.telegramPostedAt) {
    try {
      await publishArticleToTelegram(articleId);
      logger.info("Article auto-published to Telegram", { articleId });
    } catch (error) {
      logAutoPublishError("telegram", articleId, error);
    }
  }

  const afterTg = await prisma.article.findUnique({
    where: { id: articleId },
    select: { status: true, vkPostedAt: true }
  });

  if (!afterTg || afterTg.status !== "published" || afterTg.vkPostedAt) {
    return;
  }

  try {
    await publishArticleToVk(articleId);
    logger.info("Article auto-published to VK", { articleId });
  } catch (error) {
    logAutoPublishError("vk", articleId, error);
  }
}

/**
 * Откладывает авто-постинг на следующий тик event loop, чтобы не блокировать ответ админки/API.
 * Без `after()` из next/server — устраняет проблемы со сломанными webpack-chunk и ISE после частичной сборки.
 */
export function scheduleArticleSocialPublish(articleId: string) {
  queueMicrotask(() => {
    void autoPublishArticleToSocialNetworks(articleId).catch((error) => {
      logger.error("scheduleArticleSocialPublish failed", {
        articleId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

type SocialDripCandidate = {
  id: string;
  title: string;
  coverImageUrl: string | null;
};

export async function dripPublishNextArticle(): Promise<{
  processed: boolean;
  telegram: { sent: boolean; articleId: string | null; title: string | null };
  vk: { sent: boolean; articleId: string | null; title: string | null };
} | null> {
  const todayWindow = getTodayPublishWindow(SOCIAL_PUBLISH_TIME_ZONE);

  const [telegramCandidate, vkCandidate] = await Promise.all([
    prisma.article.findFirst({
      where: {
        status: "published",
        telegramPostedAt: null,
        ...buildPublicArticleImageWhere(),
        publishedAt: {
          gte: todayWindow.start,
          lt: todayWindow.end
        }
      },
      orderBy: { publishedAt: "asc" },
      select: { id: true, title: true, coverImageUrl: true }
    }),
    prisma.article.findFirst({
      where: {
        status: "published",
        vkPostedAt: null,
        ...buildPublicArticleImageWhere(),
        publishedAt: {
          gte: todayWindow.start,
          lt: todayWindow.end
        }
      },
      orderBy: { publishedAt: "asc" },
      select: { id: true, title: true, coverImageUrl: true }
    })
  ]);

  if (!telegramCandidate && !vkCandidate) {
    return null;
  }

  const result = {
    processed: false,
    telegram: {
      sent: false,
      articleId: telegramCandidate?.id ?? null,
      title: telegramCandidate?.title ?? null
    },
    vk: {
      sent: false,
      articleId: vkCandidate?.id ?? null,
      title: vkCandidate?.title ?? null
    }
  };

  const publishTelegramCandidate = async (candidate: SocialDripCandidate) => {
    try {
      await publishArticleToTelegram(candidate.id);
      result.telegram.sent = true;
      result.processed = true;
    } catch (error) {
      logAutoPublishError("telegram", candidate.id, error);
    }
  };

  const publishVkCandidate = async (candidate: SocialDripCandidate) => {
    try {
      await publishArticleToVk(candidate.id);
      result.vk.sent = true;
      result.processed = true;
    } catch (error) {
      logAutoPublishError("vk", candidate.id, error);
    }
  };

  if (telegramCandidate && vkCandidate && telegramCandidate.id === vkCandidate.id) {
    await publishTelegramCandidate(telegramCandidate);
    await publishVkCandidate(vkCandidate);
    return result;
  }

  if (telegramCandidate) {
    await publishTelegramCandidate(telegramCandidate);
  }

  if (vkCandidate) {
    await publishVkCandidate(vkCandidate);
  }

  return result;
}

export type { PublishTarget };
