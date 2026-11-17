import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { renderEventSummaryPreview, runTelegramPicks } from "@/lib/telegram-picks-runner";
import { runVkPicks, type VkPicksRunResult } from "@/lib/vk-picks-runner";

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

  // { "summaryPreview": "<slug турнира>" } отдаёт картинку-сводку и ничего не публикует.
  const previewSlug = (body as { summaryPreview?: unknown }).summaryPreview;
  if (typeof previewSlug === "string") {
    try {
      const png = await renderEventSummaryPreview(previewSlug);
      if (!png) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404, headers });
      return new Response(new Uint8Array(png), { headers: { ...headers, "content-type": "image/png" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ ok: false, error: message }, { status: 500, headers });
    }
  }

  // VK идёт своим прогоном: его сбой не должен мешать Telegram и наоборот.
  let vk: VkPicksRunResult | { error: string };
  try {
    vk = await runVkPicks({ dryRun });
    if (vk.action === "post" || vk.changed) {
      logger.info("VK picks post updated", { ...authorization.context, ...vk, text: undefined });
    }
  } catch (error) {
    vk = { error: error instanceof Error ? error.message : String(error) };
    logger.warn("VK picks run failed", { ...authorization.context, error: vk.error });
  }

  try {
    const result = await runTelegramPicks({ dryRun });
    if (result.action === "post" || result.changed) {
      logger.info("Telegram picks post updated", { ...authorization.context, ...result, text: undefined });
    }
    return NextResponse.json({ ok: true, ...result, vk }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Telegram picks run failed", { ...authorization.context, error: message });
    return NextResponse.json({ ok: false, error: message, vk }, { status: 502, headers });
  }
}
