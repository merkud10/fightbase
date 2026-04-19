
import type { ArticleCategory, ArticleStatus, SourceType } from "@prisma/client";
import http from "node:http";
import https from "node:https";

import { generateTelegramDigestForArticle, localizeIngestionInput } from "@/lib/ai-localization";
import { slugify } from "@/lib/admin";
import { buildRussianMeaningBlock, cleanNewsText, cleanNewsTitle } from "@/lib/article-quality";
import { persistImageLocally } from "@/lib/local-image-storage";
import {
  buildMeaningBlock,
  buildTokenSet,
  calculateTokenOverlap,
  normalizeComparableText,
  normalizeIngestionItem
} from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";

export interface IngestDraftInput {
  headline: string;
  body: string;
  publishedAt?: string;
  sourceLabel: string;
  sourceUrl: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
  sourceType?: SourceType;
  category?: ArticleCategory;
  promotionSlug?: string;
  eventSlug?: string;
  fighterSlugs?: string[];
  tagSlugs?: string[];
  status?: ArticleStatus;
}

export interface IngestDraftResult {
  articleId: string;
  slug: string;
  status: ArticleStatus;
  confidence: number | null;
  duplicate: boolean;
  sourceId: string;
  fighterSlugs: string[];
  tagSlugs: string[];
  eventSlug: string | null;
  promotionSlug: string | null;
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function isPredominantlyRussianText(value: string) {
  const text = String(value || "");
  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const total = cyrillic + latin;

  return total > 0 && cyrillic / total >= 0.55;
}

function normalizeAbsoluteUrl(value: string | null | undefined) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function hasManagedArticleImage(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized.startsWith("/media/articles/") || normalized === "/logo.png";
}

function looksWeakSlug(value: string) {
  const clean = String(value || "").trim().toLowerCase();
  return (
    !clean ||
    clean.length < 8 ||
    /^\d+(?:-\d+)?$/.test(clean) ||
    /^draft-\d+$/i.test(clean) ||
    /^ufc(?:-vegas)?-\d+(?:-\d+)?$/i.test(clean) ||
    /^ufc(?:-fight-night)?$/i.test(clean) ||
    /^ufc-(?:macau|vegas)$/i.test(clean) ||
    /^ufc-fight-night-\d+$/i.test(clean)
  );
}

function stripUrlSlugNoise(value: string) {
  return String(value || "")
    .trim()
    .replace(/\.(?:html?|php)$/i, "")
    .replace(/html?$/i, "")
    .replace(/^\d+-/, "")
    .replace(/^(?:news|boxing|martial-mma-ufc-news|martial-mma-news|ufc-news)-+/i, "")
    .replace(/-\d{5,}$/i, "")
    .replace(/^-+|-+$/g, "");
}

function extractSlugFromSourceUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment.trim()))
      .filter(Boolean);

    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const candidate = stripUrlSlugNoise(slugify(segments[index] ?? ""));
      if (!looksWeakSlug(candidate)) {
        return candidate;
      }
    }
  } catch {}

  return "";
}

function buildPreferredArticleSlug(title: string, sourceUrl: string) {
  const titleSlug = slugify(title);
  if (!looksWeakSlug(titleSlug)) {
    return titleSlug;
  }

  const sourceSlug = extractSlugFromSourceUrl(sourceUrl);
  if (!looksWeakSlug(sourceSlug)) {
    return sourceSlug;
  }

  return titleSlug;
}

function hasLowQualityRussianSignals(value: string) {
  return [
    /[\u043e][\u0441][\u043d][\u043e][\u0432][\u043d][\u043e][\u0439]\s+[\u0441][\u043e][\u0431][\u044b][\u0442][\u0438][\u0439]/i,
    /[\u043f][\u0435][\u0440][\u0435][\u043a][\u0443][\u043f][\u0438][\u043b][\u0438]\s+[\u0432][\u0435][\u0441]/i,
    /[\u043e][\u0441][\u043d][\u043e][\u0432][\u043d][\u043e][\u0433][\u043e]\s+[\u043a][\u0430][\u0440][\u0442][\u0430]/i,
    /[\u0438][\u043d][\u0442][\u0435][\u0440][\u0435][\u0441][\u043d][\u044b][\u0445]\s+[\u043f][\u0435][\u0440][\u0441][\u043f][\u0435][\u043a][\u0442][\u0438][\u0432][\u043e][\u043a]/i,
    /[\u0442][\u0443][\u0440][\u043d][\u0438][\u0440]\s+[\u0441][\u0442][\u0430][\u0440][\u0442][\u0443][\u0435][\u0442]\s+[\u0432]\s+0\.00/i,
    /[\u0440][\u0430][\u0441][\u043f][\u0438][\u0441][\u0430][\u043d][\u0438][\u0435].*[\u0442][\u0440][\u0430][\u043d][\u0441][\u043b][\u044f][\u0446][\u0438]/i,
    /\bhype\s*fc\b/i,
    /\bрпл\b/i,
    /\bpreview:\s/i,
    /\bup-and-coming\b/i
  ].some((pattern) => pattern.test(value));
}

function hasOffTopicUfcSignals(value: string) {
  return [
    /\boctagon\s*\d+\b/i,
    /\bказахстан\w*\b/i,
    /\bузбекистан\w*\b/i,
    /\bактер\w*\b/i,
    /\bтайсон\b/i
  ].some((pattern) => pattern.test(value));
}

function isEditorialCategory(category: ArticleCategory) {
  return category === "news" || category === "analysis" || category === "interview";
}

function normalizeSourceSlug(label: string, url: string) {
  const fromLabel = slugify(label);

  if (fromLabel) {
    return fromLabel;
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return slugify(hostname);
  } catch {
    return `source-${Date.now()}`;
  }
}

function buildSourceSlugBase(label: string, url: string) {
  const labelSlug = slugify(label) || "source";

  try {
    const parsed = new URL(url);
    const pathSlug = slugify(parsed.pathname.replace(/^\/+/, "")) || "link";
    return `${labelSlug}-${pathSlug}`;
  } catch {
    return labelSlug;
  }
}

function fetchText(url: string, maxRedirects = 5) {
  return new Promise<string>((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }

    const target = new URL(url);
    if (target.hostname === "localhost" || target.hostname === "127.0.0.1" || target.hostname.startsWith("169.254.") || target.hostname.startsWith("10.") || target.hostname.startsWith("192.168.")) {
      reject(new Error("Requests to private networks are not allowed"));
      return;
    }

    const transport = target.protocol === "https:" ? https : http;

    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "FightBaseBot/1.0"
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 500;

        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          const redirectedUrl = new URL(response.headers.location, url).toString();
          response.resume();
          fetchText(redirectedUrl, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const maxBytes = 5 * 1024 * 1024;
        let totalBytes = 0;
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;
          if (totalBytes > maxBytes) {
            request.destroy(new Error("Response too large"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", reject);
        response.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );

    request.setTimeout(180000, () => {
      request.destroy(new Error("Request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

function extractMetaContent(html: string, propertyName: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propertyName}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${propertyName}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-");
}

function stripTags(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function isolateArticleBody(html: string) {
  const containers = [
    /<div[^>]+class="[^"]*content\s+body_content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]+class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class="[^"]*article[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*post[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const re of containers) {
    const m = html.match(re);
    if (m) return m[0];
  }

  return html;
}

function isLinkOnlyParagraph(rawHtml: string) {
  const stripped = rawHtml.replace(/<!--[\s\S]*?-->/g, "").trim();
  return /^<a\s[^>]*>[\s\S]*<\/a>$/i.test(stripped);
}

function extractParagraphBody(html: string, limit = 30) {
  const body = isolateArticleBody(html);
  const blocks = Array.from(body.matchAll(/<(p|li|h2|h3)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi))
    .filter((match) => !isLinkOnlyParagraph(match[2] ?? ""))
    .map((match) => stripTags(match[2] ?? ""))
    .filter((paragraph) => paragraph.length >= 5)
    .filter(
      (paragraph) =>
        !/cookie|newsletter|subscribe|sign up|download the app|follow us|read more|advertisement|подпис|реклам/i.test(
          paragraph
        )
    );

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of blocks) {
    if (seen.has(paragraph)) continue;
    seen.add(paragraph);
    deduped.push(paragraph);
    if (deduped.length >= limit) break;
  }

  if (deduped.length > 0) {
    return deduped.join("\n\n").trim();
  }

  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h2|h3|center|blockquote|iframe)>/gi, "\n")
    .replace(/<(h2|h3)[^>]*>/gi, "\n")
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => stripTags(paragraph))
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 30)
    .filter(
      (paragraph) =>
        !/cookie|newsletter|subscribe|sign up|download the app|follow us|read more|advertisement|РїРѕРґРїРёСЃ|СЂРµРєР»Р°Рј/i.test(
          paragraph
        )
    )
    .slice(0, limit)
    .join("\n\n")
    .trim();
}

async function hydrateBodyFromSource(sourceUrl: string, fallbackBody: string) {
  try {
    const html = await fetchText(sourceUrl);
    const description =
      extractMetaContent(html, "description") ||
      extractMetaContent(html, "og:description") ||
      "";
    const paragraphBody = extractParagraphBody(html);
    const cleanDescription = stripTags(description);
    const mergedBody = [cleanDescription, paragraphBody]
      .filter(Boolean)
      .filter((part, index, array) => array.indexOf(part) === index)
      .join("\n\n")
      .trim();

    if (!mergedBody) {
      return fallbackBody;
    }

    return mergedBody.length > fallbackBody.length + 180 ? mergedBody : fallbackBody;
  } catch {
    return fallbackBody;
  }
}

async function extractArticleCoverImage(sourceUrl: string) {
  try {
    const html = await fetchText(sourceUrl);
    const image =
      extractMetaContent(html, "og:image") ||
      extractMetaContent(html, "twitter:image") ||
      extractMetaContent(html, "og:image:url");
    const alt =
      extractMetaContent(html, "og:image:alt") ||
      extractMetaContent(html, "twitter:image:alt");

    if (!image) {
      return null;
    }

    return {
      url: new URL(image, sourceUrl).toString(),
      alt: alt?.trim() || null
    };
  } catch {
    return null;
  }
}

async function ensureUniqueArticleSlug(baseSlug: string) {
  let candidate = baseSlug || `draft-${Date.now()}`;
  let counter = 1;

  while (await prisma.article.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug || "draft"}-${counter}`;
    counter += 1;
  }

  return candidate;
}

async function ensureSource(label: string, url: string, type: SourceType) {
  const existingSource = await prisma.source.findFirst({
    where: { url }
  });

  if (existingSource) {
    if (existingSource.label !== label || existingSource.type !== type || existingSource.url !== url) {
      return prisma.source.update({
        where: { id: existingSource.id },
        data: {
          label,
          type,
          url
        }
      });
    }

    return existingSource;
  }

  const baseSlug = buildSourceSlugBase(label, url);
  let candidateSlug = baseSlug;
  let counter = 1;

  while (await prisma.source.findUnique({ where: { slug: candidateSlug }, select: { id: true } })) {
    candidateSlug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return prisma.source.create({
    data: {
      slug: candidateSlug,
      label,
      type,
      url
    }
  });
}

function buildAliases(values: Array<string | null | undefined>) {
  return uniqueItems(
    values
      .flatMap((value) => {
        if (!value) {
          return [];
        }

        const normalized = normalizeComparableText(value);
        const slugStyle = normalized.replace(/\s+/g, "-");

        return [normalized, slugStyle, normalized.replace(/-/g, " ")];
      })
      .filter(Boolean)
  );
}

function findBestMatch<T>(items: T[], getAliases: (item: T) => string[], text: string, minScore: number) {
  let best: { item: T; score: number } | null = null;

  for (const item of items) {
    const aliases = getAliases(item);
    let score = 0;

    for (const alias of aliases) {
      if (!alias) {
        continue;
      }

      if (text.includes(alias)) {
        score = Math.max(score, alias.split(" ").length >= 2 ? 1 : 0.7);
      } else {
        const overlap = calculateTokenOverlap(buildTokenSet(text), buildTokenSet(alias));
        score = Math.max(score, overlap);
      }
    }

    if (score >= minScore && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best?.item ?? null;
}

async function inferRelations(input: IngestDraftInput) {
  const text = normalizeComparableText(`${input.headline} ${input.body}`);
  const normalizedProvidedFighterSlugs = uniqueItems(input.fighterSlugs ?? []);
  const normalizedProvidedTagSlugs = uniqueItems(input.tagSlugs ?? []);

  const [promotions, fighters, tags, events] = await Promise.all([
    prisma.promotion.findMany({ select: { id: true, slug: true, name: true, shortName: true } }),
    prisma.fighter.findMany({ select: { id: true, slug: true, name: true, nameRu: true, nickname: true } }),
    prisma.tag.findMany({ select: { id: true, slug: true, label: true } }),
    prisma.event.findMany({ select: { id: true, slug: true, name: true, promotionId: true } })
  ]);

  const promotionBySlug = input.promotionSlug
    ? promotions.find((item) => item.slug === input.promotionSlug) ?? null
    : null;
  const eventBySlug = input.eventSlug ? events.find((item) => item.slug === input.eventSlug) ?? null : null;

  const promotion =
    promotionBySlug ??
    findBestMatch(
      promotions,
      (item) => buildAliases([item.slug, item.name, item.shortName]),
      text,
      0.7
    );

  const event =
    eventBySlug ??
    findBestMatch(events, (item) => buildAliases([item.slug, item.name]), text, 0.72);

  const russianStems = (nameRu: string) => {
    const words = nameRu.toLowerCase().trim().split(/\s+/);
    const stems: string[] = [];

    for (const word of words) {
      if (word.length >= 7) {
        stems.push(word.slice(0, -2));
      } else if (word.length >= 6) {
        stems.push(word.slice(0, -1));
      } else if (word.length >= 5) {
        stems.push(word);
      }
    }

    return stems;
  };

  const matchFighterInText = (fighter: (typeof fighters)[number]) => {
    const aliases = buildAliases([fighter.slug, fighter.name, fighter.nameRu, fighter.nickname]);

    if (aliases.some((alias) => alias && text.includes(alias) && alias.split(" ").length >= 2)) {
      return true;
    }

    if (fighter.nameRu) {
      const stems = russianStems(fighter.nameRu);

      if (stems.length >= 2) {
        const positions = stems.map((stem) => text.indexOf(stem));

        if (positions.every((pos) => pos >= 0)) {
          const span = Math.max(...positions) - Math.min(...positions);
          if (span <= 80) {
            return true;
          }
        }
      }

      if (stems.length === 1 && (stems[0]?.length ?? 0) >= 6 && text.includes(stems[0] ?? "")) {
        return true;
      }
    }

    return false;
  };

  const inferredFighters =
    normalizedProvidedFighterSlugs.length > 0
      ? fighters.filter(
          (fighter) => normalizedProvidedFighterSlugs.includes(fighter.slug) || matchFighterInText(fighter)
        )
      : fighters.filter(matchFighterInText);

  const inferredTags =
    normalizedProvidedTagSlugs.length > 0
      ? tags.filter((tag) => normalizedProvidedTagSlugs.includes(tag.slug))
      : tags.filter((tag) => buildAliases([tag.slug, tag.label]).some((alias) => alias && text.includes(alias)));

  const resolvedPromotion =
    promotion ?? (event ? promotions.find((item) => item.id === event.promotionId) ?? null : null);

  return {
    promotion: resolvedPromotion,
    event,
    fighters: inferredFighters,
    tags: inferredTags
  };
}

function buildIngestionSourceSummary(input: IngestDraftInput, relations: Awaited<ReturnType<typeof inferRelations>>) {
  return [
    `Source: ${input.sourceLabel}`,
    `URL: ${input.sourceUrl}`,
    relations.promotion ? `Promotion: ${relations.promotion.slug}` : null,
    relations.event ? `Event: ${relations.event.slug}` : null,
    relations.fighters.length > 0 ? `Fighters: ${relations.fighters.map((fighter) => fighter.slug).join(", ")}` : null,
    relations.tags.length > 0 ? `Tags: ${relations.tags.map((tag) => tag.slug).join(", ")}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildIngestionNotes(
  input: IngestDraftInput,
  confidence: number,
  relations: Awaited<ReturnType<typeof inferRelations>>,
  duplicateReason?: string,
  localization?: { localized: boolean; model: string | null },
  forcedDraftReason?: string
) {
  const notes = [
    "AI draft created from source ingestion.",
    `Confidence: ${confidence.toFixed(2)}.`,
    localization?.localized ? `Localized to Russian with ${localization.model}.` : "Saved in source language.",
    relations.event ? "Event matched automatically." : "No event matched automatically.",
    relations.promotion ? `Promotion matched: ${relations.promotion.shortName}.` : "No promotion matched automatically.",
    relations.fighters.length > 0
      ? `Matched fighters: ${relations.fighters.map((fighter) => fighter.name).join(", ")}.`
      : "No fighters matched automatically.",
    relations.tags.length > 0
      ? `Matched tags: ${relations.tags.map((tag) => tag.label).join(", ")}.`
      : "No tags matched automatically."
  ];

  if (duplicateReason) {
    notes.push(`Duplicate guard: ${duplicateReason}.`);
  }

  if (forcedDraftReason) {
    notes.push(`Publication guard: ${forcedDraftReason}.`);
  }

  if (input.fighterSlugs?.length) {
    notes.push(`Provided fighter slugs: ${input.fighterSlugs.join(", ")}.`);
  }

  if (input.tagSlugs?.length) {
    notes.push(`Provided tag slugs: ${input.tagSlugs.join(", ")}.`);
  }

  return notes.join(" ");
}

function getDuplicateReason(titleOverlap: number, sameSource: boolean, samePromotion: boolean, sameEvent: boolean) {
  const reasons = [];

  if (titleOverlap >= 0.92) {
    reasons.push("headline match is almost exact");
  } else if (titleOverlap >= 0.75) {
    reasons.push("headline match is highly similar");
  }

  if (sameSource) {
    reasons.push("same source");
  }

  if (samePromotion) {
    reasons.push("same promotion");
  }

  if (sameEvent) {
    reasons.push("same event");
  }

  return reasons.join(", ");
}

async function findDuplicateCandidate(
  normalizedTitle: string,
  sourceId: string,
  relations: Awaited<ReturnType<typeof inferRelations>>,
  category: ArticleCategory
) {
  const existingArticles = await prisma.article.findMany({
    where: {
      OR: [
        { sourceMap: { some: { sourceId } } },
        ...(relations.event?.id ? [{ eventId: relations.event.id }] : []),
        ...(relations.promotion?.id ? [{ promotionId: relations.promotion.id }] : [])
      ]
    },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      promotionId: true,
      eventId: true,
      event: { select: { slug: true } },
      promotion: { select: { slug: true } },
      fighterMap: { include: { fighter: { select: { slug: true } } } },
      tagMap: { include: { tag: { select: { slug: true } } } },
      sourceMap: { select: { sourceId: true } }
    },
    take: 30
  });

  const incomingTokens = buildTokenSet(normalizedTitle);
  const relationFighterIds = new Set(relations.fighters.map((fighter) => fighter.id));
  const isFightSpecificAnalysis = category === "analysis" && Boolean(relations.event?.id) && relationFighterIds.size >= 2;

  for (const article of existingArticles) {
    const existingTitle = normalizeComparableText(article.title);
    const titleOverlap = calculateTokenOverlap(incomingTokens, buildTokenSet(existingTitle));
    const sameSource = article.sourceMap.some((item) => item.sourceId === sourceId);
    const samePromotion = Boolean(relations.promotion?.id && article.promotionId === relations.promotion.id);
    const sameEvent = Boolean(relations.event?.id && article.eventId === relations.event.id);
    const fighterOverlapCount = article.fighterMap.filter((item) => relationFighterIds.has(item.fighterId)).length;

    const exactMatch = existingTitle === normalizedTitle;
    const nearMatch =
      titleOverlap >= 0.75 &&
      (sameSource || samePromotion || sameEvent) &&
      (!isFightSpecificAnalysis || fighterOverlapCount >= 2);
    const interviewSameFighter =
      category === "interview" &&
      fighterOverlapCount >= 1 &&
      titleOverlap >= 0.35;

    if (exactMatch || nearMatch || interviewSameFighter) {
      return {
        article,
        reason: getDuplicateReason(titleOverlap, sameSource, samePromotion, sameEvent) || "matched existing article"
      };
    }
  }

  return null;
}

/** Латиница + кириллица: одна и та же новость с разных сайтов не совпадает по заголовку. */
const INJURY_STORY_MARKERS = [
  "nose",
  "нос",
  "fracture",
  "перелом",
  "shatter",
  "broken",
  "сломан",
  "сломал",
  "surgery",
  "операци",
  "injury",
  "травм",
  "medical",
  "медицин",
  "corrective",
  "training",
  "трениров",
  "withdraw",
  "отказ"
];

const CROSS_SOURCE_WINDOW_DAYS = 14;

function fighterNameTokens(fighter: { name: string; nameRu: string | null; slug: string }): string[] {
  const out: string[] = [];
  const parts = [fighter.name, fighter.nameRu || "", ...fighter.slug.split("-")];
  for (const part of parts) {
    for (const raw of part.split(/\s+/)) {
      const t = raw.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
      if (t.length >= 4) {
        out.push(t);
      }
    }
  }
  return [...new Set(out)];
}

function hasInjurySignal(text: string) {
  const lower = text.toLowerCase();
  return INJURY_STORY_MARKERS.some((m) => lower.includes(m));
}

/** Подстроки, которые есть в обоих текстах (как следы одной темы). */
function countSharedSubstringsInBoth(textA: string, textB: string, markers: string[]) {
  const la = textA.toLowerCase();
  const lb = textB.toLowerCase();
  let n = 0;
  for (const m of markers) {
    if (m.length < 3) continue;
    if (la.includes(m) && lb.includes(m)) {
      n += 1;
    }
  }
  return n;
}

function sharedFighterNameAppearsInBoth(textA: string, textB: string, tokens: string[]) {
  const la = textA.toLowerCase();
  const lb = textB.toLowerCase();
  return tokens.some((t) => t.length >= 4 && la.includes(t) && lb.includes(t));
}

type ArticleDupRow = {
  id: string;
  slug: string;
  status: import("@prisma/client").ArticleStatus;
  title: string;
  excerpt: string;
  meaning: string;
  publishedAt: Date;
  promotionId: string | null;
  eventId: string | null;
  event: { slug: string } | null;
  promotion: { slug: string } | null;
  fighterMap: Array<{
    fighterId: string;
    fighter: { id: string; name: string; nameRu: string | null; slug: string };
  }>;
  tagMap: Array<{ tag: { slug: string } }>;
};

async function findSlugCollisionDuplicate(
  tx: { article: typeof prisma.article },
  params: {
    baseSlug: string;
    sourceId: string;
    category: ArticleCategory;
    publishedAt: Date;
  }
): Promise<{ article: ArticleDupRow; reason: string } | null> {
  const { baseSlug, sourceId, category, publishedAt } = params;
  if (!baseSlug) return null;

  const windowStart = new Date(publishedAt);
  windowStart.setHours(windowStart.getHours() - 24);
  const windowEnd = new Date(publishedAt);
  windowEnd.setHours(windowEnd.getHours() + 24);

  const article = await tx.article.findFirst({
    where: {
      category,
      sourceMap: { some: { sourceId } },
      publishedAt: { gte: windowStart, lte: windowEnd },
      slug: {
        in: [baseSlug, ...Array.from({ length: 20 }, (_, index) => `${baseSlug}-${index + 1}`)]
      }
    },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      excerpt: true,
      meaning: true,
      publishedAt: true,
      promotionId: true,
      eventId: true,
      event: { select: { slug: true } },
      promotion: { select: { slug: true } },
      fighterMap: {
        include: {
          fighter: { select: { id: true, name: true, nameRu: true, slug: true } }
        }
      },
      tagMap: { include: { tag: { select: { slug: true } } } }
    },
    orderBy: { publishedAt: "desc" }
  });

  if (!article) return null;
  return { article: article as ArticleDupRow, reason: `slug-collision dedup (base: ${baseSlug})` };
}

async function findCrossSourceNewsDuplicate(
  tx: { article: typeof prisma.article },
  params: {
    category: ArticleCategory;
    relations: Awaited<ReturnType<typeof inferRelations>>;
    incomingPublishedAt: Date;
    incomingTextBlob: string;
  }
): Promise<{ article: ArticleDupRow; reason: string } | null> {
  const { category, relations, incomingPublishedAt, incomingTextBlob } = params;

  const eligibleCategories: ArticleCategory[] = ["news", "interview"];
  if (!eligibleCategories.includes(category) || relations.fighters.length === 0) {
    return null;
  }

  const fighterIds = relations.fighters.map((f) => f.id);
  const incomingFighterTokens = relations.fighters.flatMap(fighterNameTokens);

  const windowStart = new Date(incomingPublishedAt);
  windowStart.setDate(windowStart.getDate() - CROSS_SOURCE_WINDOW_DAYS);
  const windowEnd = new Date(incomingPublishedAt);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const candidates = await tx.article.findMany({
    where: {
      category,
      publishedAt: { gte: windowStart, lte: windowEnd },
      fighterMap: { some: { fighterId: { in: fighterIds } } }
    },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      excerpt: true,
      meaning: true,
      publishedAt: true,
      promotionId: true,
      eventId: true,
      event: { select: { slug: true } },
      promotion: { select: { slug: true } },
      fighterMap: {
        include: {
          fighter: { select: { id: true, name: true, nameRu: true, slug: true } }
        }
      },
      tagMap: { include: { tag: { select: { slug: true } } } }
    },
    take: 50,
    orderBy: { publishedAt: "desc" }
  });

  const incomingNorm = normalizeComparableText(incomingTextBlob);
  const incomingTokens = buildTokenSet(incomingNorm);

  for (const article of candidates) {
    const sharedFighterIds = article.fighterMap.filter((m) => fighterIds.includes(m.fighterId)).length;
    if (sharedFighterIds < 1) continue;

    const existingBlob = [article.title, article.excerpt, article.meaning].join("\n");
    const existingNorm = normalizeComparableText(existingBlob);
    const existingTokens = buildTokenSet(existingNorm);
    const tokenOverlap = calculateTokenOverlap(incomingTokens, existingTokens);

    const existingFighterTokens = article.fighterMap.flatMap((m) => fighterNameTokens(m.fighter));
    const markerPool = [...new Set([...incomingFighterTokens, ...existingFighterTokens, ...INJURY_STORY_MARKERS])];
    const sharedMarkers = countSharedSubstringsInBoth(incomingTextBlob, existingBlob, markerPool);

    const crossLangSameStory =
      sharedFighterNameAppearsInBoth(incomingTextBlob, existingBlob, incomingFighterTokens) &&
      hasInjurySignal(incomingTextBlob) &&
      hasInjurySignal(existingBlob);

    const sameHeadlineFamily = tokenOverlap >= 0.24;
    const strongMarkerOverlap = sharedMarkers >= 3;
    const mediumMarkerAndOverlap = sharedMarkers >= 2 && tokenOverlap >= 0.1;
    const injuryCrossLang = crossLangSameStory && sharedFighterIds >= 1;

    if (sameHeadlineFamily || strongMarkerOverlap || mediumMarkerAndOverlap || injuryCrossLang) {
      const reason = sameHeadlineFamily
        ? `cross-source text overlap ${tokenOverlap.toFixed(2)}`
        : strongMarkerOverlap
          ? `cross-source shared markers (${sharedMarkers})`
          : mediumMarkerAndOverlap
            ? "cross-source markers + overlap"
            : "cross-source same fighter + injury signals (different outlets/languages)";

      return {
        article: article as ArticleDupRow,
        reason
      };
    }
  }

  return null;
}

function adjustConfidence(
  baseConfidence: number,
  relations: Awaited<ReturnType<typeof inferRelations>>,
  duplicateGuardTriggered: boolean
) {
  let confidence = baseConfidence;

  if (relations.promotion) {
    confidence += 0.08;
  }

  if (relations.event) {
    confidence += 0.1;
  }

  if (relations.fighters.length > 0) {
    confidence += Math.min(0.1, relations.fighters.length * 0.04);
  }

  if (relations.tags.length > 0) {
    confidence += Math.min(0.06, relations.tags.length * 0.02);
  }

  if (duplicateGuardTriggered) {
    confidence -= 0.2;
  }

  return Math.max(0.2, Math.min(0.97, Number(confidence.toFixed(2))));
}

export async function createDraftFromIngestion(input: IngestDraftInput): Promise<IngestDraftResult> {
  const source = await ensureSource(input.sourceLabel.trim(), input.sourceUrl.trim(), input.sourceType ?? "official");

  const sourceUrlTag = `URL: ${input.sourceUrl.trim()}`;
  const existingByUrl = await prisma.article.findFirst({
    where: {
      ingestionSourceSummary: { contains: sourceUrlTag },
      sourceMap: { some: { sourceId: source.id } }
    },
    select: {
      id: true,
      slug: true,
      status: true,
      aiConfidence: true,
      promotion: { select: { slug: true } },
      event: { select: { slug: true } },
      fighterMap: { include: { fighter: { select: { slug: true } } } },
      tagMap: { include: { tag: { select: { slug: true } } } }
    }
  });

  if (existingByUrl) {
    return {
      articleId: existingByUrl.id,
      slug: existingByUrl.slug,
      status: existingByUrl.status,
      confidence: existingByUrl.aiConfidence ?? 0.5,
      duplicate: true,
      sourceId: source.id,
      fighterSlugs: existingByUrl.fighterMap.map((item) => item.fighter.slug),
      tagSlugs: existingByUrl.tagMap.map((item) => item.tag.slug),
      eventSlug: existingByUrl.event?.slug ?? null,
      promotionSlug: existingByUrl.promotion?.slug ?? null
    };
  }

  const fallbackSourceSlug = buildPreferredArticleSlug(input.headline.trim(), input.sourceUrl.trim());
  const hydratedBody = await hydrateBodyFromSource(source.url, input.body);
  const hydratedInput = {
    ...input,
    body: hydratedBody
  };
  let localizedInput = {
    headline: hydratedInput.headline,
    body: hydratedInput.body,
    localized: false,
    model: null as string | null,
    interestScore: null as number | null
  };

  try {
    localizedInput = await localizeIngestionInput(hydratedInput);
  } catch (error) {
    console.error("Failed to localize ingestion input", error);
  }

  const MIN_INTEREST_SCORE = 4;
  if (localizedInput.interestScore !== null && localizedInput.interestScore < MIN_INTEREST_SCORE) {
    console.log(`Skipping "${cleanNewsTitle(localizedInput.headline)}": interestScore=${localizedInput.interestScore} (below ${MIN_INTEREST_SCORE})`);
    throw new Error(`Article rejected: interestScore ${localizedInput.interestScore} is below threshold ${MIN_INTEREST_SCORE}`);
  }

  const normalized = normalizeIngestionItem({
    headline: localizedInput.headline,
    body: localizedInput.body,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    source: {
      id: source.id,
      label: source.label,
      type: source.type,
      url: source.url
    }
  });

  const mergedTagSlugs = uniqueItems([...(input.tagSlugs ?? []), ...normalized.relatedTagSlugs]);
  const relations = await inferRelations({
    ...hydratedInput,
    headline: localizedInput.headline,
    body: localizedInput.body,
    category: hydratedInput.category ?? normalized.articleDraft.category,
    tagSlugs: mergedTagSlugs
  });
  const qualityFighters = relations.fighters.map((fighter) => ({
    name: fighter.name,
    nameRu: fighter.nameRu
  }));
  const cleanedTitle = cleanNewsTitle(normalized.articleDraft.title, qualityFighters);
  const cleanedExcerpt = cleanNewsText(normalized.articleDraft.excerpt, qualityFighters);
  const cleanedBody = cleanNewsText(normalized.articleDraft.body, qualityFighters);
  const articleCover = await extractArticleCoverImage(source.url);
  const providedCoverImageUrl = normalizeAbsoluteUrl(input.coverImageUrl);
  let persistedCoverImageUrl: string | null = null;
  let coverDownloadFailed = false;
  const coverSourceUrl = providedCoverImageUrl ?? articleCover?.url ?? null;

  try {
    persistedCoverImageUrl = await persistImageLocally({
      bucket: "articles",
      key: normalized.articleDraft.slug || fallbackSourceSlug || cleanedTitle,
      sourceUrl: coverSourceUrl
    });
  } catch (error) {
    coverDownloadFailed = true;
    console.error(`Article cover download failed for "${cleanedTitle}":`, error instanceof Error ? error.message : error);
  }

  const providedCoverImageAlt = String(input.coverImageAlt || "").trim() || null;
  const requestedStatus = hydratedInput.status ?? "draft";
  const editorialCategory = input.category ?? normalized.articleDraft.category;
  if (!hasManagedArticleImage(persistedCoverImageUrl)) {
    const reason = coverDownloadFailed
      ? `Cover image download failed after retries (source: ${coverSourceUrl ?? "none"})`
      : `No usable cover image found (source: ${coverSourceUrl ?? "none"})`;
    console.error(`Skipping article "${cleanedTitle}": ${reason}`);
    throw new Error(`${reason} for "${cleanedTitle}"`);
  }

  const cleanedLocalizedText = `${cleanedTitle}\n${cleanedExcerpt}\n${cleanedBody}`;
  const forcedDraftReason =
    isEditorialCategory(editorialCategory) &&
          requestedStatus === "published" &&
          !isPredominantlyRussianText(cleanedLocalizedText)
        ? "English or mixed-language output detected after localization; saved as draft instead of published."
        : editorialCategory === "news" &&
            requestedStatus === "published" &&
            hasOffTopicUfcSignals(cleanedLocalizedText)
          ? "Off-topic combat-sports story detected; saved as draft instead of published."
        : requestedStatus === "published" &&
            hasLowQualityRussianSignals(cleanedLocalizedText)
          ? "Low-quality Russian newsroom output detected; saved as draft instead of published."
        : null;
  const finalStatus = forcedDraftReason ? "draft" : requestedStatus;

  let telegramDigest: string | null = null;
  try {
    telegramDigest = await generateTelegramDigestForArticle(cleanedTitle, cleanedBody);
  } catch (error) {
    console.error("Telegram digest generation failed", error);
  }

  const result = await prisma.$transaction(async (tx) => {
    const duplicateCandidate = await findDuplicateCandidate(
      normalizeComparableText(normalized.articleDraft.title),
      source.id,
      relations,
      input.category ?? normalized.articleDraft.category
    );
    const crossSourceDup = await findCrossSourceNewsDuplicate(tx, {
      category: editorialCategory,
      relations,
      incomingPublishedAt: new Date(normalized.articleDraft.publishedAt),
      incomingTextBlob: `${cleanedTitle}\n${cleanedExcerpt}\n${cleanedBody}`
    });
    const confidence = adjustConfidence(
      normalized.confidence,
      relations,
      Boolean(duplicateCandidate || crossSourceDup)
    );

    if (duplicateCandidate) {
      return {
        articleId: duplicateCandidate.article.id,
        slug: duplicateCandidate.article.slug,
        status: duplicateCandidate.article.status,
        confidence,
        duplicate: true,
        sourceId: source.id,
        fighterSlugs: duplicateCandidate.article.fighterMap.map((item) => item.fighter.slug),
        tagSlugs: duplicateCandidate.article.tagMap.map((item) => item.tag.slug),
        eventSlug: duplicateCandidate.article.event?.slug ?? null,
        promotionSlug: duplicateCandidate.article.promotion?.slug ?? null
      };
    }

    if (crossSourceDup) {
      const a = crossSourceDup.article;
      return {
        articleId: a.id,
        slug: a.slug,
        status: a.status,
        confidence,
        duplicate: true,
        sourceId: source.id,
        fighterSlugs: a.fighterMap.map((item) => item.fighter.slug),
        tagSlugs: a.tagMap.map((item) => item.tag.slug),
        eventSlug: a.event?.slug ?? null,
        promotionSlug: a.promotion?.slug ?? null
      };
    }

    const desiredBaseSlug = looksWeakSlug(normalized.articleDraft.slug)
      ? fallbackSourceSlug
      : normalized.articleDraft.slug || fallbackSourceSlug;

    const slugCollisionDup = await findSlugCollisionDuplicate(tx, {
      baseSlug: desiredBaseSlug,
      sourceId: source.id,
      category: editorialCategory,
      publishedAt: new Date(normalized.articleDraft.publishedAt)
    });

    if (slugCollisionDup) {
      const a = slugCollisionDup.article;
      return {
        articleId: a.id,
        slug: a.slug,
        status: a.status,
        confidence,
        duplicate: true,
        sourceId: source.id,
        fighterSlugs: a.fighterMap.map((item) => item.fighter.slug),
        tagSlugs: a.tagMap.map((item) => item.tag.slug),
        eventSlug: a.event?.slug ?? null,
        promotionSlug: a.promotion?.slug ?? null
      };
    }

    const article = await tx.article.create({
      data: {
        slug: await ensureUniqueArticleSlug(desiredBaseSlug),
        title: cleanedTitle,
        coverImageUrl: persistedCoverImageUrl,
        coverImageAlt: providedCoverImageAlt ?? articleCover?.alt ?? cleanedTitle,
        excerpt: cleanedExcerpt,
        meaning: buildRussianMeaningBlock(cleanedBody) || buildMeaningBlock(localizedInput.body),
          category: editorialCategory,
        status: finalStatus,
        aiConfidence: confidence,
        ingestionSourceSummary: buildIngestionSourceSummary(hydratedInput, relations),
        ingestionNotes: buildIngestionNotes(
          hydratedInput,
          confidence,
          relations,
          undefined,
          localizedInput,
          forcedDraftReason ?? undefined
        ),
        telegramDigest,
        publishedAt: new Date(normalized.articleDraft.publishedAt),
        promotionId: relations.promotion?.id ?? null,
        eventId: relations.event?.id ?? null,
        sections: {
          create: [
            {
              heading: "AI draft",
              body: cleanedBody,
              sortOrder: 1
            }
          ]
        },
        fighterMap: {
          create: relations.fighters.map((fighter) => ({ fighterId: fighter.id }))
        },
        tagMap: {
          create: relations.tags.map((tag) => ({ tagId: tag.id }))
        },
        sourceMap: {
          create: [{ sourceId: source.id }]
        }
      },
      include: {
        promotion: { select: { slug: true } },
        event: { select: { slug: true } },
        fighterMap: { include: { fighter: { select: { slug: true } } } },
        tagMap: { include: { tag: { select: { slug: true } } } }
      }
    });

    return {
      articleId: article.id,
      slug: article.slug,
      status: article.status,
      confidence: article.aiConfidence,
      duplicate: false,
      sourceId: source.id,
      fighterSlugs: article.fighterMap.map((item) => item.fighter.slug),
      tagSlugs: article.tagMap.map((item) => item.tag.slug),
      eventSlug: article.event?.slug ?? null,
      promotionSlug: article.promotion?.slug ?? null
    };
  }, { timeout: 15_000 });

  return result;
}
