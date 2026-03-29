import { NextResponse } from "next/server";

import { createDraftFromIngestion, type IngestDraftInput } from "@/lib/ingestion";

export async function POST(request: Request) {
  const body = (await request.json()) as IngestDraftInput;

  if (!body.headline || !body.body || !body.sourceLabel || !body.sourceUrl) {
    return NextResponse.json(
      {
        error: "headline, body, sourceLabel, and sourceUrl are required"
      },
      { status: 400 }
    );
  }

  const draft = await createDraftFromIngestion(body);

  return NextResponse.json({
    ok: true,
    draft
  });
}
