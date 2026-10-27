import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { runTelegramPicks } from "@/lib/telegram-picks-runner";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:telegram-picks",
      limit: 6,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const headers = { "cache-control": "no-store", "x-request-id": authorization.context.requestId };
  const body = await request.json().catch(() => ({}));
  const dryRun = (body as { dryRun?: unknown }).dryRun === true;

  try {
    const result = await runTelegramPicks({ dryRun });
    if (result.action === "post" || result.changed) {
      logger.info("Telegram picks post updated", { ...authorization.context, ...result, text: undefined });
    }
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Telegram picks run failed", { ...authorization.context, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers });
  }
}
