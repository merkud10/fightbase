import type { ArticleCategory, SourceType } from "@prisma/client";

import { slugify } from "@/lib/admin";

export interface IngestionItem {
  headline: string;
  source: {
    id: string;
    label: string;
    type: SourceType;
    url: string;
  };
  publishedAt: string;
  body: string;
}

export interface NormalizedPayload {
  articleDraft: {
    title: string;
    slug: string;
    excerpt: string;
    meaning: string;
    body: string;
    category: ArticleCategory;
    publishedAt: string;
    sourceIds: string[];
  };
  relatedFighterSlugs: string[];
  relatedEventSlug?: string;
  relatedTagSlugs: string[];
  confidence: number;
}

const tagKeywordMap: Record<string, string[]> = {
  ufc: ["ufc", "fight night", "ultimate fighting championship"],
  results: ["results", "result", "wins", "defeats", "scores", "finishes"],
  rumors: ["rumor", "rumors", "reportedly", "targeting", "talks"],
  injuries: ["injury", "injured", "withdraws", "withdrawn", "medical issue"],
  announcements: ["announced", "announcement", "booking", "booked", "official"],
  "title-fight": ["title fight", "title bout", "championship fight", "belt"],
  "weigh-ins": ["weigh-in", "weigh ins", "misses weight", "weight miss"],
  "press-conference": ["press conference", "media day"]
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildExcerpt(articleText: string, maxLength = 180) {
  const normalized = normalizeWhitespace(articleText);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function inferCategory(headline: string, body: string): ArticleCategory {
  const text = `${headline} ${body}`.toLowerCase();

  if (["breakdown", "preview", "analysis", "what next", "why"].some((token) => text.includes(token))) {
    return "analysis";
  }

  if (["interview", "quote", "says", "said", "media scrum"].some((token) => text.includes(token))) {
    return "interview";
  }

  if (["video", "watch", "highlight"].some((token) => text.includes(token))) {
    return "video";
  }

  if (["top 10", "history", "best of", "feature"].some((token) => text.includes(token))) {
    return "feature";
  }

  return "news";
}

function inferTagSlugs(headline: string, body: string) {
  const text = normalizeForMatch(`${headline} ${body}`);

  return unique(
    Object.entries(tagKeywordMap)
      .filter(([, keywords]) => keywords.some((keyword) => text.includes(normalizeForMatch(keyword))))
      .map(([slug]) => slug)
  );
}

function estimateConfidence(headline: string, body: string, sourceType: SourceType, tagCount: number) {
  const headlineLength = normalizeWhitespace(headline).length;
  const bodyLength = normalizeWhitespace(body).length;
  const sentenceCount = body.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;

  let score = 0.25;

  if (headlineLength >= 28) {
    score += 0.1;
  }

  if (bodyLength >= 240) {
    score += 0.14;
  }

  if (bodyLength >= 600) {
    score += 0.08;
  }

  if (sentenceCount >= 3) {
    score += 0.08;
  }

  if (tagCount > 0) {
    score += Math.min(0.1, tagCount * 0.03);
  }

  if (sourceType === "official" || sourceType === "press_release") {
    score += 0.12;
  } else if (sourceType === "interview" || sourceType === "stats") {
    score += 0.08;
  } else {
    score += 0.04;
  }

  return Math.max(0.2, Math.min(0.92, Number(score.toFixed(2))));
}

export function normalizeIngestionItem(item: IngestionItem): NormalizedPayload {
  const normalizedBody = normalizeWhitespace(item.body);
  const normalizedHeadline = normalizeWhitespace(item.headline);
  const relatedTagSlugs = inferTagSlugs(normalizedHeadline, normalizedBody);
  const category = inferCategory(normalizedHeadline, normalizedBody);

  return {
    articleDraft: {
      title: normalizedHeadline,
      slug: slugify(normalizedHeadline),
      excerpt: buildExcerpt(normalizedBody),
      meaning: buildMeaningBlock(normalizedBody),
      body: item.body.trim(),
      category,
      publishedAt: item.publishedAt,
      sourceIds: [item.source.id]
    },
    relatedFighterSlugs: [],
    relatedEventSlug: undefined,
    relatedTagSlugs,
    confidence: estimateConfidence(normalizedHeadline, normalizedBody, item.source.type, relatedTagSlugs.length)
  };
}

export function buildMeaningBlock(articleText: string) {
  const excerpt = buildExcerpt(articleText, 120);
  return `Почему это важно: ${excerpt}`;
}

export function buildTokenSet(value: string) {
  return new Set(tokenize(value));
}

export function calculateTokenOverlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(left.size, right.size);
}

export function normalizeComparableText(value: string) {
  return normalizeForMatch(value);
}
