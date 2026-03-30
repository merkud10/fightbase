import { NextResponse } from "next/server";

import { getLatestIngestionRun } from "@/lib/db";
import { getEnvironmentReport } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const environment = getEnvironmentReport();
    const [articleCount, fighterCount, eventCount, latestIngestionRun] = await Promise.all([
      prisma.article.count(),
      prisma.fighter.count(),
      prisma.event.count(),
      getLatestIngestionRun()
    ]);

    return NextResponse.json({
      ok: true,
      service: "fightbase-media",
      timestamp: new Date().toISOString(),
      checks: {
        database: "ok",
        environment,
        content: {
          articles: articleCount,
          fighters: fighterCount,
          events: eventCount
        },
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "fightbase-media",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown health check error"
      },
      { status: 500 }
    );
  }
}
