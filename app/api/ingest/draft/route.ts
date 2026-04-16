import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { authorizeRequest } from "@/lib/api-security";
import { createDraftFromIngestion } from "@/lib/ingestion";
import { logger } from "@/lib/logger";
import { recordSystemEvent } from "@/lib/system-events";
import { IngestDraftInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowAdminSession: true,
    allowInternalToken: true,
    rateLimit: {
      scope: "api:ingest:draft",
      limit: 60,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = IngestDraftInputSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const draft = await createDraftFromIngestion(parsed.data);
    if (draft.status === "published" && !draft.duplicate) {
      revalidatePath("/", "layout");
      revalidatePath("/news", "layout");
      revalidatePath("/analysis", "layout");
      revalidatePath("/quotes", "layout");
    }
    logger.info("Draft ingestion succeeded", {
      ...authorization.context,
      authKind: authorization.kind,
      slug: draft.slug,
      articleId: draft.articleId
    });
    void recordSystemEvent({
      level: "info",
      category: "ingest.draft",
      message: "Draft ingestion succeeded",
      source: "api/ingest/draft",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        authKind: authorization.kind,
        slug: draft.slug,
        articleId: draft.articleId
      }
    });

    return NextResponse.json(
      { ok: true, draft },
      {
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isLowInterest = /interestScore \d+ is below threshold/.test(errorMessage);

    if (isLowInterest) {
      logger.info("Draft ingestion skipped (low interest)", {
        ...authorization.context,
        authKind: authorization.kind,
        reason: errorMessage
      });
      void recordSystemEvent({
        level: "info",
        category: "ingest.draft",
        message: "Draft ingestion skipped (low interest)",
        source: "api/ingest/draft",
        requestId: authorization.context.requestId,
        path: authorization.context.path,
        ipAddress: authorization.context.ip,
        meta: {
          authKind: authorization.kind,
          reason: errorMessage
        }
      });
      return NextResponse.json(
        { ok: false, skipped: true, reason: errorMessage },
        {
          status: 200,
          headers: {
            "x-request-id": authorization.context.requestId
          }
        }
      );
    }

    logger.error("Draft ingestion failed", {
      ...authorization.context,
      authKind: authorization.kind,
      error: errorMessage
    });
    void recordSystemEvent({
      level: "error",
      category: "ingest.draft",
      message: "Draft ingestion failed",
      source: "api/ingest/draft",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        authKind: authorization.kind,
        error: errorMessage
      }
    });
    return NextResponse.json(
      { error: errorMessage || "Draft ingestion failed" },
      {
        status: 500,
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
