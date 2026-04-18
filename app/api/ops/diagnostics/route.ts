import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { resolveAppRoot } from "@/lib/paths";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StuckLock = { name: string; holderPid: number | null; stateHint: string | null };

const LOCK_DIR = "/var/lock/fightbase";
const SILENCE_THRESHOLD_MS = 8 * 60 * 60 * 1000;

function inspectLocks(): { present: string[]; stuck: StuckLock[] } {
  if (!fs.existsSync(LOCK_DIR)) {
    return { present: [], stuck: [] };
  }
  const entries = fs.readdirSync(LOCK_DIR).filter((name) => name.endsWith(".lock"));
  return { present: entries, stuck: [] };
}

function inspectSymlinks() {
  const standaloneRoot = path.join(resolveAppRoot(), ".next", "standalone");
  const targets = ["public", "scripts", "node_modules"];
  return targets.map((target) => {
    const full = path.join(standaloneRoot, target);
    try {
      const stat = fs.lstatSync(full);
      return {
        name: target,
        exists: true,
        isSymlink: stat.isSymbolicLink(),
        realPath: stat.isSymbolicLink() ? fs.readlinkSync(full) : null
      };
    } catch {
      return { name: target, exists: false, isSymlink: false, realPath: null };
    }
  });
}

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowAdminSession: true,
    allowInternalToken: true,
    rateLimit: { scope: "api:ops:diagnostics", limit: 60, windowMs: 60_000 }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const now = Date.now();

  const [
    latestSyncNews,
    latestArticle,
    queueStats,
    hiddenArticles,
    articlesLast24h
  ] = await Promise.all([
    prisma.backgroundJob.findFirst({
      where: { type: "weekly-news" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, startedAt: true, finishedAt: true, attempts: true, errorMessage: true }
    }),
    prisma.article.findFirst({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, publishedAt: true, createdAt: true }
    }),
    prisma.backgroundJob.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.article.findMany({
      where: {
        status: "published",
        category: "news",
        OR: [
          { coverImageUrl: null },
          { coverImageUrl: "" },
          {
            AND: [
              { coverImageUrl: { not: { startsWith: "/media/articles/" } } },
              { coverImageUrl: { not: "/logo.png" } }
            ]
          }
        ]
      },
      select: { id: true, slug: true, coverImageUrl: true },
      take: 20,
      orderBy: { publishedAt: "desc" }
    }),
    prisma.article.count({
      where: {
        status: "published",
        publishedAt: { gte: new Date(now - 24 * 60 * 60 * 1000) }
      }
    })
  ]);

  const lastSuccessAgeMs = latestSyncNews?.finishedAt
    ? now - latestSyncNews.finishedAt.getTime()
    : null;

  const locks = inspectLocks();
  const symlinks = inspectSymlinks();

  const warnings: string[] = [];
  if (latestSyncNews?.status !== "succeeded") {
    warnings.push(`Last weekly-news status: ${latestSyncNews?.status ?? "missing"}`);
  }
  if (lastSuccessAgeMs !== null && lastSuccessAgeMs > SILENCE_THRESHOLD_MS) {
    warnings.push(
      `weekly-news silent for ${Math.round(lastSuccessAgeMs / 3_600_000)}h (threshold ${Math.round(
        SILENCE_THRESHOLD_MS / 3_600_000
      )}h)`
    );
  }
  if (hiddenArticles.length > 0) {
    warnings.push(`${hiddenArticles.length} published articles have invalid coverImageUrl`);
  }
  for (const link of symlinks) {
    if (link.name === "scripts" || link.name === "public") {
      if (!link.exists) {
        warnings.push(`.next/standalone/${link.name} missing`);
      } else if (!link.isSymlink) {
        warnings.push(`.next/standalone/${link.name} is a copy, not a symlink (run deploy.sh)`);
      }
    }
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    warnings,
    weeklyNews: {
      lastJob: latestSyncNews,
      lastSuccessAgeHours: lastSuccessAgeMs !== null ? Math.round(lastSuccessAgeMs / 3_600_000) : null
    },
    content: {
      latestArticle,
      articlesLast24h,
      hiddenPublishedArticles: hiddenArticles
    },
    queue: Object.fromEntries(queueStats.map((s) => [s.status, s._count._all])),
    infrastructure: {
      appRoot: resolveAppRoot(),
      cwd: process.cwd(),
      locks,
      standaloneLinks: symlinks
    }
  });
}
