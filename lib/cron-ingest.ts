import type { backgroundJobTypes } from "@/lib/background-jobs";

type BackgroundJobType = (typeof backgroundJobTypes)[number];
type CronIngestJobInput = "watchlist" | "weekly-news" | "ai-discovery" | "sync-odds" | "sync-roster" | undefined;

export function resolveCronIngestJob(job: CronIngestJobInput): BackgroundJobType {
  if (!job) {
    throw new Error("job is required");
  }

  if (job === "ai-discovery") {
    return "weekly-news";
  }

  return job;
}
