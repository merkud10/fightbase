import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { getArticleRouteBase } from "@/lib/article-routes";
import { getUfcRankingSnapshot } from "@/lib/db";
import { buildIndexNowPayloads, INDEXNOW_ENDPOINT, isIndexNowEnabled, resolveIndexNowSince } from "@/lib/indexnow";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { findRankingDivision } from "@/lib/ranking-divisions";
import { getSiteUrl } from "@/lib/site";
import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";

// Те же адреса, что в sitemap, но только изменённые после `since`. Карточки бойцов
// не шлём: ежедневные синки трогают тысячи профилей, и пинг превратился бы в шум.
async function collectChangedUrls(siteUrl: string, since: Date) {
  const [articles, events, snapshots, rankingSnapshot] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published", updatedAt: { gt: since } },
      select: { slug: true, category: true }
    }),
    prisma.event.findMany({
      where: { updatedAt: { gt: since } },
      select: { slug: true }
    }),
    prisma.fightPredictionSnapshot.findMany({
      where: { updatedAt: { gt: since } },
      select: { fight: { select: { slug: true, event: { select: { slug: true } } } } }
    }),
    getUfcRankingSnapshot()
  ]);
  const paths: string[] = [];

  for (const article of articles) {
    const base = getArticleRouteBase(article.category);
    paths.push(`${base}/${article.slug}`, base);
  }
  for (const event of events) {
    paths.push(`/events/${event.slug}`, "/events");
  }
  for (const snapshot of snapshots) {
    if (snapshot.fight.slug && !isPlaceholderFightSlug(snapshot.fight.slug)) {
      paths.push(`/predictions/${snapshot.fight.event.slug}/${snapshot.fight.slug}`, "/predictions");
    }
  }
  if (rankingSnapshot && rankingSnapshot.fetchedAt > since) {
    paths.push("/rankings");
    for (const group of rankingSnapshot.groups) {
      const division = findRankingDivision(group.title);
      if (division) paths.push(`/rankings/${division.slug}`);
    }
  }
  if (paths.length > 0) {
    paths.push("");
  }

  return paths.map((path) => `${siteUrl}/ru${path}`);
}

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
  const urls = await collectChangedUrls(siteUrl, since);
  const payloads = buildIndexNowPayloads(siteUrl, urls);
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
