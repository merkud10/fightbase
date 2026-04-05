import { prisma } from "@/lib/prisma";
import { recordSystemEvent } from "@/lib/system-events";

export const backgroundJobTypes = [
  "watchlist",
  "ai-discovery",
  "sync-odds",
  "weekly-analysis",
  "sync-roster",
  "operational-alerts"
] as const;

export type BackgroundJobType = (typeof backgroundJobTypes)[number];

type EnqueueBackgroundJobInput = {
  type: BackgroundJobType;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
};

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput) {
  const job = await prisma.backgroundJob.create({
    data: {
      type: input.type,
      payload: JSON.stringify(input.payload),
      priority: input.priority ?? 100,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt ?? new Date()
    }
  });

  await recordSystemEvent({
    level: "info",
    category: "jobs.queue",
    message: "Background job enqueued",
    source: "background-jobs",
    meta: {
      jobId: job.id,
      type: job.type,
      priority: job.priority
    }
  });

  return job;
}

export async function listRecentBackgroundJobs(limit = 20) {
  return prisma.backgroundJob.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit
  });
}
