import { NextResponse } from "next/server";

import { getLatestIngestionRun } from "@/lib/db";
import { getEnvironmentReport } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getReadinessReport } from "@/lib/operational-monitoring";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/request";
import { recordSystemEvent } from "@/lib/system-events";

export async function GET(request: Request) {
  const context = getRequestContext(request);
  try {
    const environment = getEnvironmentReport();
    const [articleCount, fighterCount, eventCount, latestIngestionRun, dbProbe, readiness] = await Promise.all([
      prisma.article.count(),
      prisma.fighter.count(),
      prisma.event.count(),
      getLatestIngestionRun(),
      prisma.$queryRaw`SELECT 1`,
      getReadinessReport()
    ]);

    return NextResponse.json({
      ok: true,
      service: "fightbase-media",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbProbe ? "ok" : "degraded",
        environment,
        content: {
          articles: articleCount,
          fighters: fighterCount,
          events: eventCount
        },
        readiness: readiness.checks,
        ingestion: latestIngestionRun
          ? {
              status: latestIngestionRun.status,
              mode: latestIngestionRun.mode,
              sourceKind: latestIngestionRun.sourceKind,
              startedAt: latestIngestionRun.startedAt,
              finishedAt: latestIngestionRun.finishedAt,
              itemCount: latestIngestionRun.itemCount,
              createdCount: latestIngestionRun.createdCount,
              duplicateCount: latestIngestionRun.duplicateCount,
              failedCount: latestIngestionRun.failedCount
            }
          : {
              status: "missing",
              message: "No ingestion runs recorded yet."
            }
      }
    }, {
      headers: {
        "x-request-id": context.requestId
      }
    });
  } catch (error) {
    logger.error("Health check failed", {
      ...context,
      error: error instanceof Error ? error.message : String(error)
    });
    void recordSystemEvent({
      level: "error",
      category: "api.health",
      message: "Health check failed",
      source: "api/health",
      requestId: context.requestId,
      path: context.path,
      ipAddress: context.ip,
      meta: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return NextResponse.json(
      {
        ok: false,
        service: "fightbase-media",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown health check error"
      },
      {
        status: 500,
        headers: {
          "x-request-id": context.requestId
        }
      }
    );
  }
}
