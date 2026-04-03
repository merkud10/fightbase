import { z } from "zod";

export const ArticleCategorySchema = z.enum(["news", "analysis", "interview", "feature", "video"]);
export const ArticleStatusSchema = z.enum(["draft", "review", "published"]);
export const EventStatusSchema = z.enum(["upcoming", "live", "completed"]);
export const FighterStatusSchema = z.enum(["active", "champion", "retired", "prospect"]);
export const SourceTypeSchema = z.enum(["official", "interview", "social", "press_release", "stats"]);

export const IngestDraftInputSchema = z.object({
  headline: z.string().min(1, "headline is required"),
  body: z.string().min(1, "body is required"),
  publishedAt: z.string().optional(),
  sourceLabel: z.string().min(1, "sourceLabel is required"),
  sourceUrl: z.string().url("sourceUrl must be a valid URL"),
  coverImageUrl: z.string().url().optional(),
  coverImageAlt: z.string().optional(),
  sourceType: SourceTypeSchema.optional(),
  category: ArticleCategorySchema.optional(),
  promotionSlug: z.string().optional(),
  eventSlug: z.string().optional(),
  fighterSlugs: z.array(z.string()).optional(),
  tagSlugs: z.array(z.string()).optional(),
  status: ArticleStatusSchema.optional()
});

export const IngestPreviewInputSchema = z.object({
  headline: z.string().min(1, "headline is required"),
  body: z.string().min(1, "body is required"),
  publishedAt: z.string().optional(),
  sourceLabel: z.string().min(1, "sourceLabel is required"),
  sourceUrl: z.string().url("sourceUrl must be a valid URL")
});

export const CronIngestInputSchema = z.object({
  file: z.string().optional(),
  dryRun: z.boolean().optional(),
  job: z.enum(["watchlist", "ai-discovery", "sync-odds", "weekly-analysis"]).optional(),
  lookbackHours: z.number().finite().positive().optional(),
  limit: z.number().finite().int().positive().optional(),
  status: z.enum(["draft", "review", "published"]).optional()
});

export const BrowserPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export const SaveBrowserPushInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  subscription: BrowserPushSubscriptionSchema
});
