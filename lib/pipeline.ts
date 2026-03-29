import type { Article, Event, Fighter, Source } from "@/lib/types";

export interface IngestionItem {
  headline: string;
  source: Source;
  publishedAt: string;
  body: string;
}

export interface NormalizedPayload {
  articleDraft: Partial<Article>;
  relatedFighters: Fighter[];
  relatedEvent?: Event;
  confidence: number;
}

export function normalizeIngestionItem(item: IngestionItem): NormalizedPayload {
  return {
    articleDraft: {
      title: item.headline,
      excerpt: item.body.slice(0, 180),
      publishedAt: item.publishedAt,
      sourceIds: [item.source.id]
    },
    relatedFighters: [],
    relatedEvent: undefined,
    confidence: 0.42
  };
}

export function buildMeaningBlock(articleText: string) {
  return `Why it matters: ${articleText.slice(0, 120)}...`;
}
