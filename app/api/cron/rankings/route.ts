import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { refreshUfcRankingSnapshot } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordSystemEvent } from "@/lib/system-events";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:rankings",
      limit: 6,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const result = await refreshUfcRankingSnapshot();
    const responseBody = {
      ok: result.updated,
      updated: result.updated,
      preserved: result.preserved,
      reason: result.reason,
      groupCount: result.snapshot?.groups.length ?? 0,
      fetchedAt: result.snapshot?.fetchedAt.toISOString() ?? null,
      stale: result.snapshot?.isStale ?? null
    };

    if (!result.updated) {
      logger.warn("UFC ranking snapshot refresh preserved the previous snapshot", {
        ...authorization.context,
        preserved: result.preserved,
        groupCount: responseBody.groupCount
      });
      void recordSystemEvent({
        level: "warn",
        category: "rankings.refresh",
        message: "UFC ranking snapshot refresh returned no usable data",
        source: "api/cron/rankings",
        requestId: authorization.context.requestId,
        path: authorization.context.path,
        ipAddress: authorization.context.ip,
        meta: {
          preserved: result.preserved,
          groupCount: responseBody.groupCount
        }
      });

      return NextResponse.json(responseBody, {
        status: 502,
        headers: {
          "cache-control": "no-store",
          "x-request-id": authorization.context.requestId
        }
      });
    }

    revalidatePath("/rankings", "page");
    revalidatePath("/ru/rankings", "page");
    logger.info("UFC ranking snapshot refreshed", {
      ...authorization.context,
      groupCount: responseBody.groupCount,
      fetchedAt: responseBody.fetchedAt
    });
    void recordSystemEvent({
      level: "info",
      category: "rankings.refresh",
      message: "UFC ranking snapshot refreshed",
      source: "api/cron/rankings",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        groupCount: responseBody.groupCount,
        fetchedAt: responseBody.fetchedAt
      }
    });

    return NextResponse.json(responseBody, {
      headers: {
        "cache-control": "no-store",
        "x-request-id": authorization.context.requestId
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UFC ranking snapshot refresh failed";
    logger.error("UFC ranking snapshot refresh failed", {
      ...authorization.context,
      error: message
    });
    void recordSystemEvent({
      level: "error",
      category: "rankings.refresh",
      message: "UFC ranking snapshot refresh failed",
      source: "api/cron/rankings",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: { error: message }
    });

    return NextResponse.json(
      { ok: false, updated: false, error: message },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
