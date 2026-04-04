import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { buildMeaningBlock, normalizeIngestionItem } from "@/lib/pipeline";
import { recordSystemEvent } from "@/lib/system-events";
import { IngestPreviewInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowAdminSession: true,
    allowInternalToken: true,
    rateLimit: {
      scope: "api:ingest:preview",
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

  const parsed = IngestPreviewInputSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const body = parsed.data;
    const preview = normalizeIngestionItem({
      headline: body.headline,
      body: body.body,
      publishedAt: body.publishedAt ?? new Date().toISOString(),
      source: {
        id: "preview-source",
        label: body.sourceLabel,
        type: "official",
        url: body.sourceUrl
      }
    });

    return NextResponse.json({
      ok: true,
      preview: {
        ...preview,
        meaning: buildMeaningBlock(body.body)
      }
    }, {
      headers: {
        "x-request-id": authorization.context.requestId
      }
    });
  } catch (error) {
    logger.error("Preview ingestion failed", {
      ...authorization.context,
      authKind: authorization.kind,
      error: error instanceof Error ? error.message : String(error)
    });
    void recordSystemEvent({
      level: "error",
      category: "ingest.preview",
      message: "Preview ingestion failed",
      source: "api/ingest/preview",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        authKind: authorization.kind,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      {
        status: 500,
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
