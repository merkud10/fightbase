import { NextResponse } from "next/server";

import { createDraftFromIngestion } from "@/lib/ingestion";
import { IngestDraftInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
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

    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    console.error("Draft ingestion failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Draft ingestion failed" },
      { status: 500 }
    );
  }
}
