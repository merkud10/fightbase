import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { logger } from "@/lib/logger";
import { recordSystemEvent } from "@/lib/system-events";
import { CronIngestInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:ingest",
      limit: 24,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = CronIngestInputSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const job =
    body.job === "watchlist"
      ? "watchlist"
      : body.job === "weekly-news" || body.job === "ai-discovery"
        ? "weekly-news"
      : body.job === "sync-odds"
        ? "sync-odds"
      : body.job === "weekly-analysis"
          ? "weekly-analysis"
        : body.job === "sync-roster"
            ? "sync-roster"
            : "weekly-news";

  try {
    const enqueuedJob = await enqueueBackgroundJob({
      type: job,
      priority: body.priority ?? (job === "sync-odds" ? 25 : 100),
      payload: {
        baseUrl: new URL(request.url).origin,
        file: body.file,
        dryRun: body.dryRun,
        lookbackHours: body.lookbackHours,
        limit: body.limit,
        days: body.days,
        limitPerSource: body.limitPerSource,
        target: body.target,
        sourceLabel: body.sourceLabel,
        status: body.status
      }
    });
    logger.info("Cron ingest enqueued", {
      ...authorization.context,
      job,
      mode: body.dryRun ? "dry-run" : "write",
      queuedJobId: enqueuedJob.id
    });
    void recordSystemEvent({
      level: "info",
      category: "jobs.cron_ingest",
      message: "Cron ingest enqueued",
      source: "api/cron/ingest",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        job,
        mode: body.dryRun ? "dry-run" : "write",
        queuedJobId: enqueuedJob.id
      }
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      queuedJobId: enqueuedJob.id,
      job,
      mode: body.dryRun ? "dry-run" : "write"
    }, {
      headers: {
        "x-request-id": authorization.context.requestId
      }
    });
  } catch (error) {
    const executionError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    logger.error("Cron ingest failed", {
      ...authorization.context,
      job,
      error: executionError.message ?? "Cron ingest enqueue failed"
    });
    void recordSystemEvent({
      level: "error",
      category: "jobs.cron_ingest",
      message: "Cron ingest enqueue failed",
      source: "api/cron/ingest",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        job,
        error: executionError.message ?? "Cron ingest enqueue failed"
      }
    });
    return NextResponse.json(
      {
        ok: false,
        error: executionError.message ?? "Cron ingest enqueue failed"
      },
      {
        status: 500,
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
