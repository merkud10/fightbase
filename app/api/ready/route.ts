import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getReadinessReport } from "@/lib/operational-monitoring";
import { getRequestContext } from "@/lib/request";
import { recordSystemEvent } from "@/lib/system-events";

export async function GET(request: Request) {
  const context = getRequestContext(request);

  try {
    const readiness = await getReadinessReport();

    return NextResponse.json(
      {
        service: "fightbase-media",
        ...readiness
      },
      {
        status: readiness.ok ? 200 : 503,
        headers: {
          "x-request-id": context.requestId
        }
      }
    );
  } catch (error) {
    logger.error("Readiness check failed", {
      ...context,
      error: error instanceof Error ? error.message : String(error)
    });
    void recordSystemEvent({
      level: "error",
      category: "api.ready",
      message: "Readiness check failed",
      source: "api/ready",
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
        error: error instanceof Error ? error.message : "Unknown readiness error"
      },
      {
        status: 503,
        headers: {
          "x-request-id": context.requestId
        }
      }
    );
  }
}
