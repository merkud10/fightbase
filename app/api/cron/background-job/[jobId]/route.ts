import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";

/** Парсит блок Summary из stdout discover-weekly-news.js. */
function parseWeeklyNewsSummary(result: string | null): {
  created: number;
  duplicates: number;
  failed: number;
} | null {
  if (!result) {
    return null;
  }
  const created = result.match(/^Created:\s*(\d+)/m);
  const duplicates = result.match(/^Duplicates:\s*(\d+)/m);
  const failed = result.match(/^Failed:\s*(\d+)/m);
  if (!created && !duplicates && !failed) {
    return null;
  }
  return {
    created: created ? Number(created[1]) : 0,
    duplicates: duplicates ? Number(duplicates[1]) : 0,
    failed: failed ? Number(failed[1]) : 0
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:background-job",
      limit: 120,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const { jobId } = await params;
  if (!jobId?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 });
  }

  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId.trim() }
  });

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const stats =
    job.type !== "ai-discovery"
      ? null
      : parseWeeklyNewsSummary(job.result) ??
        (job.status === "succeeded"
          ? { created: 0, duplicates: 0, failed: 0 }
          : null);

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      result: job.result,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt
    },
    stats
  });
}
