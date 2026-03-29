import { NextResponse } from "next/server";

import { buildMeaningBlock, normalizeIngestionItem } from "@/lib/pipeline";

interface PreviewRequestBody {
  headline: string;
  body: string;
  publishedAt?: string;
  sourceLabel: string;
  sourceUrl: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as PreviewRequestBody;

  if (!body.headline || !body.body || !body.sourceLabel || !body.sourceUrl) {
    return NextResponse.json(
      {
        error: "headline, body, sourceLabel, and sourceUrl are required"
      },
      { status: 400 }
    );
  }

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
}
