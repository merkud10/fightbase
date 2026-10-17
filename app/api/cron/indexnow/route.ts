import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { getFreshPages } from "@/lib/fresh-pages";
import { buildIndexNowPayloads, INDEXNOW_ENDPOINT, isIndexNowEnabled, resolveIndexNowSince } from "@/lib/indexnow";
import { logger } from "@/lib/logger";
import { getSiteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:indexnow",
      limit: 6,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const headers = { "cache-control": "no-store", "x-request-id": authorization.context.requestId };
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");

  if (!isIndexNowEnabled(siteUrl)) {
    return NextResponse.json({ ok: true, skipped: "not a production host", submitted: 0 }, { headers });
  }

  const body = await request.json().catch(() => ({}));
  const since = resolveIndexNowSince((body as { since?: unknown }).since);
  const pages = await getFreshPages(since);
  const payloads = buildIndexNowPayloads(
    siteUrl,
    pages.map((page) => `${siteUrl}/ru${page.path}`)
  );
  const statuses: number[] = [];

  for (const payload of payloads) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000)
    });
    statuses.push(response.status);
  }

  // 200 и 202 — приняли; 202 значит, что ключ ещё проверяется.
  const ok = statuses.every((status) => status === 200 || status === 202);
  const submitted = payloads.reduce((sum, payload) => sum + payload.urlList.length, 0);
  const meta = { ...authorization.context, since: since.toISOString(), submitted, statuses };
  if (ok) {
    logger.info("IndexNow submission", meta);
  } else {
    logger.warn("IndexNow submission rejected", meta);
  }

  return NextResponse.json({ ok, since: since.toISOString(), submitted, statuses }, { status: ok ? 200 : 502, headers });
}
