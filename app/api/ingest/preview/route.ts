import { NextResponse } from "next/server";

import { buildMeaningBlock, normalizeIngestionItem } from "@/lib/pipeline";
import { IngestPreviewInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
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
    });
  } catch (error) {
    console.error("Preview ingestion failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
