import type { ArticleCategory } from "@prisma/client";

import { getArticleHref } from "./article-routes";

// Пост в ВК — анонс, а не копия статьи: заголовок, пара предложений сути и ссылка.
// Полный текст в ленте никто не дочитывает, а переходить на сайт после него незачем.

/** Сколько знаков пересказа помещается в пост до ссылки. */
export const VK_LEAD_MAX = 420;
const VK_LEAD_SENTENCES = 3;

/** Статьи о той же паре бойцов, вышедшие ближе этого срока, считаем одной темой. */
export const VK_DUPLICATE_WINDOW_MS = 12 * 3_600_000;
const TITLE_SIMILARITY_THRESHOLD = 0.5;

export type VkPostArticle = {
  slug: string;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  sections: { heading: string; body: string }[];
  eventName?: string | null;
};

export type VkDedupArticle = {
  title: string;
  publishedAt: Date;
  fighterIds: string[];
};

/** Хэштеги приезжают из источников («#january30th») и в ленте выглядят мусором. */
export function stripHashtags(text: string): string {
  return String(text || "")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const sentences = flat.match(/[^.!?…]+[.!?…]+[»"”)]*(?=\s|$)|[^.!?…]+$/g) || [flat];
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const breakAt = slice.lastIndexOf(" ");
  return `${(breakAt > max * 0.5 ? slice.slice(0, breakAt) : slice).replace(/[\s,;:—-]+$/, "")}…`;
}

/** Первые два-три предложения статьи, не длиннее VK_LEAD_MAX. */
export function buildVkLead(article: Pick<VkPostArticle, "title" | "excerpt" | "sections">): string {
  const body = article.sections
    .map((section) => String(section.body || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const source = stripHashtags(body) || stripHashtags(article.excerpt);
  const title = article.title.trim();
  const sentences = splitSentences(source).filter((sentence) => sentence.replace(/[.!?…]+$/, "") !== title);
  if (sentences.length === 0) return "";

  let lead = "";
  for (const sentence of sentences.slice(0, VK_LEAD_SENTENCES)) {
    const next = lead ? `${lead} ${sentence}` : sentence;
    if (next.length > VK_LEAD_MAX) break;
    lead = next;
  }

  return lead || cutAtWord(sentences[0] ?? "", VK_LEAD_MAX);
}

export function buildVkArticleUrl(origin: string, category: ArticleCategory, slug: string): string {
  const url = new URL(getArticleHref(category, slug), origin);
  url.searchParams.set("utm_source", "vk");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "autopost");
  return url.toString();
}

/** Один-два своих хэштега: турнир (или просто UFC) и рубрика. */
export function buildVkHashtags(article: Pick<VkPostArticle, "title" | "category" | "eventName">): string[] {
  const tags: string[] = [];
  const haystack = `${article.eventName || ""} ${article.title}`;
  const numbered = haystack.match(/UFC\s+(\d{3})(?!\d)/i);

  if (numbered) {
    tags.push(`#UFC${numbered[1]}`);
  } else if (/UFC/i.test(haystack)) {
    tags.push("#UFC");
  } else {
    tags.push("#MMA");
  }

  if (article.category === "analysis") {
    tags.push("#разбор");
  } else if (article.category === "interview") {
    tags.push("#цитаты");
  } else if (/прогноз/i.test(article.title)) {
    tags.push("#прогноз");
  }

  return tags;
}

export function buildVkPostMessage(article: VkPostArticle, origin: string): string {
  const title = stripHashtags(article.title);
  const lead = buildVkLead(article);
  const url = buildVkArticleUrl(origin, article.category, article.slug);

  return [title, lead, `Читать полностью: ${url}`, buildVkHashtags(article).join(" ")]
    .filter(Boolean)
    .join("\n\n");
}

const RESULT_VERBS =
  /(?<![а-яё])(победил|выиграл|проиграл|уступил|нокаутировал|задушил|защитил|сохранил|завоевал|одолел|финишировал)[аи]?(?![а-яё])/i;

/** Итог боя и новость до боя — разные поводы, даже если бойцы те же. */
export function isResultTitle(title: string): boolean {
  return RESULT_VERBS.test(title);
}

function titleTokens(title: string): Set<string> {
  const words = title.toLowerCase().replace(/ё/g, "е").match(/[a-zа-я0-9]+/g) || [];
  return new Set(words.filter((word) => word.length >= 4).map((word) => word.slice(0, 5)));
}

export function titleSimilarity(a: string, b: string): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }
  return common / (left.size + right.size - common);
}

/**
 * Дубль — вторая статья о том же поводе: те же два бойца и тот же тип новости
 * (итог боя или всё остальное) в пределах окна. Сравниваем время выхода статей,
 * а не время постинга: иначе пропущенный дубль всплыл бы в группе через полдня.
 * Без данных о бойцах смотрим на совпадение слов в заголовках.
 */
export function isVkDuplicate(
  candidate: VkDedupArticle,
  posted: VkDedupArticle[],
  windowMs: number = VK_DUPLICATE_WINDOW_MS
): boolean {
  const candidateIsResult = isResultTitle(candidate.title);

  return posted.some((other) => {
    if (Math.abs(candidate.publishedAt.getTime() - other.publishedAt.getTime()) > windowMs) return false;

    if (titleSimilarity(candidate.title, other.title) >= TITLE_SIMILARITY_THRESHOLD) return true;

    const otherFighters = new Set(other.fighterIds);
    const sharedFighters = candidate.fighterIds.filter((id) => otherFighters.has(id)).length;
    return sharedFighters >= 2 && candidateIsResult === isResultTitle(other.title);
  });
}

export type VkThrottleState = {
  now: Date;
  lastPostedAt: Date | null;
  postedToday: number;
  minIntervalMinutes: number;
  dailyLimit: number;
};

/** Причина, по которой сейчас постить не надо, либо null. */
export function getVkThrottleReason(state: VkThrottleState): string | null {
  if (state.dailyLimit > 0 && state.postedToday >= state.dailyLimit) {
    return `daily limit reached (${state.postedToday}/${state.dailyLimit})`;
  }

  if (state.lastPostedAt && state.minIntervalMinutes > 0) {
    const minutesSince = (state.now.getTime() - state.lastPostedAt.getTime()) / 60_000;
    if (minutesSince < state.minIntervalMinutes) {
      return `last post ${Math.floor(minutesSince)} min ago, interval is ${state.minIntervalMinutes} min`;
    }
  }

  return null;
}

/** Самая свежая статья из очереди, которая не повторяет уже вышедшее в группе. */
export function pickVkCandidate<T extends VkDedupArticle>(candidates: T[], posted: VkDedupArticle[]): T | null {
  const newestFirst = [...candidates].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return newestFirst.find((candidate) => !isVkDuplicate(candidate, posted)) ?? null;
}
