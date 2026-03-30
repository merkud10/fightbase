import type { ArticleCategory, ArticleStatus, SourceType } from "@prisma/client";
import http from "node:http";
import https from "node:https";

import { localizeIngestionInput } from "@/lib/ai-localization";
import { slugify } from "@/lib/admin";
import { buildRussianMeaningBlock, cleanNewsText, cleanNewsTitle } from "@/lib/article-quality";
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

function fetchText(url: string) {
  return new Promise<string>((resolve, reject) => {
    const target = new URL(url);
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
          fetchText(redirectedUrl).then(resolve).catch(reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );

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

function extractParagraphBody(html: string, limit = 14) {
  const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripTags(match[1]))
    .filter((paragraph) => paragraph.length >= 80)
    .filter(
      (paragraph) =>
        !/cookie|newsletter|subscribe|sign up|download the app|follow us|read more|advertisement/i.test(paragraph)
    )
    .slice(0, limit);

  return paragraphs.join("\n\n").trim();
}

async function hydrateBodyFromSource(sourceUrl: string, fallbackBody: string) {
  try {
    const html = await fetchText(sourceUrl);
    const description =
      extractMetaContent(html, "description") ||
      extractMetaContent(html, "og:description") ||
      "";
    const paragraphBody = extractParagraphBody(html);
    const mergedBody = [description, paragraphBody]
      .map((part) => stripTags(part))
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

  const inferredFighters =
    normalizedProvidedFighterSlugs.length > 0
      ? fighters.filter((fighter) => normalizedProvidedFighterSlugs.includes(fighter.slug))
      : fighters.filter((fighter) => {
          const aliases = buildAliases([fighter.slug, fighter.name, fighter.nickname]);
          return aliases.some((alias) => alias && text.includes(alias) && alias.split(" ").length >= 2);
        });

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
  localization?: { localized: boolean; model: string | null }
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
  relations: Awaited<ReturnType<typeof inferRelations>>
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

  for (const article of existingArticles) {
    const existingTitle = normalizeComparableText(article.title);
    const titleOverlap = calculateTokenOverlap(incomingTokens, buildTokenSet(existingTitle));
    const sameSource = article.sourceMap.some((item) => item.sourceId === sourceId);
    const samePromotion = Boolean(relations.promotion?.id && article.promotionId === relations.promotion.id);
    const sameEvent = Boolean(relations.event?.id && article.eventId === relations.event.id);

    const exactMatch = existingTitle === normalizedTitle;
    const nearMatch = titleOverlap >= 0.75 && (sameSource || samePromotion || sameEvent);

    if (exactMatch || nearMatch) {
      return {
        article,
        reason: getDuplicateReason(titleOverlap, sameSource, samePromotion, sameEvent) || "matched existing article"
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
  const fallbackSourceSlug = slugify(input.headline.trim());
  const hydratedBody = await hydrateBodyFromSource(source.url, input.body);
  const hydratedInput = {
    ...input,
    body: hydratedBody
  };
  let localizedInput = {
    headline: hydratedInput.headline,
    body: hydratedInput.body,
    localized: false,
    model: null as string | null
  };

  try {
    localizedInput = await localizeIngestionInput(hydratedInput);
  } catch (error) {
    console.error("Failed to localize ingestion input", error);
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
  const duplicateCandidate = await findDuplicateCandidate(normalizeComparableText(normalized.articleDraft.title), source.id, relations);
  const confidence = adjustConfidence(normalized.confidence, relations, Boolean(duplicateCandidate));

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

  const articleCover = await extractArticleCoverImage(source.url);

  const article = await prisma.article.create({
    data: {
      slug: await ensureUniqueArticleSlug(normalized.articleDraft.slug || fallbackSourceSlug),
      title: cleanedTitle,
      coverImageUrl: articleCover?.url ?? null,
      coverImageAlt: articleCover?.alt ?? cleanedTitle,
      excerpt: cleanedExcerpt,
      meaning: buildRussianMeaningBlock(cleanedBody) || buildMeaningBlock(localizedInput.body),
      category: input.category ?? normalized.articleDraft.category,
      status: hydratedInput.status ?? "draft",
      aiConfidence: confidence,
      ingestionSourceSummary: buildIngestionSourceSummary(hydratedInput, relations),
      ingestionNotes: buildIngestionNotes(hydratedInput, confidence, relations, undefined, localizedInput),
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
}
