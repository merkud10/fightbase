import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { requireAdminSession } from "@/lib/auth/server";
import { resolveAppRoot } from "@/lib/paths";
import { prisma } from "@/lib/prisma";

import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "FightBase — Диагностика",
    robots: { index: false, follow: false }
  };
}

const SILENCE_THRESHOLD_MS = 8 * 60 * 60 * 1000;
const LOCK_DIR = "/var/lock/fightbase";

function inspectStandaloneLinks() {
  const standaloneRoot = path.join(resolveAppRoot(), ".next", "standalone");
  return ["public", "scripts", "node_modules"].map((name) => {
    const full = path.join(standaloneRoot, name);
    try {
      const stat = fs.lstatSync(full);
      return {
        name,
        exists: true,
        isSymlink: stat.isSymbolicLink(),
        target: stat.isSymbolicLink() ? fs.readlinkSync(full) : null
      };
    } catch {
      return { name, exists: false, isSymlink: false, target: null };
    }
  });
}

function inspectLocks() {
  try {
    return fs
      .readdirSync(LOCK_DIR)
      .filter((n) => n.endsWith(".lock"))
      .map((n) => {
        const stat = fs.statSync(path.join(LOCK_DIR, n));
        return { name: n, mtime: stat.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export default async function AdminHealthPage() {
  await requireAdminSession();
  const now = Date.now();

  const [
    latestSyncNews,
    latestArticle,
    queueGroups,
    hiddenArticles,
    articles24h,
    recentJobs,
    recentEvents
  ] = await Promise.all([
    prisma.backgroundJob.findFirst({
      where: { type: "weekly-news" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.article.findFirst({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, publishedAt: true }
    }),
    prisma.backgroundJob.groupBy({ by: ["status"], _count: { _all: true } }),
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
    }),
    prisma.backgroundJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        attempts: true,
        errorMessage: true
      }
    }),
    prisma.systemEvent.findMany({
      where: { level: { in: ["error", "warn"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, createdAt: true, level: true, category: true, message: true }
    })
  ]);

  const lastSuccessAge = latestSyncNews?.finishedAt
    ? now - latestSyncNews.finishedAt.getTime()
    : null;
  const links = inspectStandaloneLinks();
  const locks = inspectLocks();

  const warnings: string[] = [];
  if (latestSyncNews?.status !== "succeeded") {
    warnings.push(`Последний weekly-news: ${latestSyncNews?.status ?? "не найден"}`);
  }
  if (lastSuccessAge !== null && lastSuccessAge > SILENCE_THRESHOLD_MS) {
    warnings.push(`weekly-news не обновлялся ${formatDuration(lastSuccessAge)}`);
  }
  if (hiddenArticles.length > 0) {
    warnings.push(`Скрытых published-статей (некорректный coverImageUrl): ${hiddenArticles.length}`);
  }
  for (const link of links) {
    if ((link.name === "scripts" || link.name === "public") && !link.isSymlink) {
      warnings.push(`.next/standalone/${link.name} — не symlink (запустите deploy.sh)`);
    }
  }

  return (
    <main className="container">
      <PageHero eyebrow="/admin/health" title="Диагностика" description="Состояние ingestion, очереди и инфраструктуры." />

      {warnings.length > 0 ? (
        <section className="admin-section" style={{ borderLeft: "4px solid #b00", paddingLeft: 12, marginBottom: 24 }}>
          <h2>Предупреждения ({warnings.length})</h2>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="admin-section" style={{ borderLeft: "4px solid #0a0", paddingLeft: 12, marginBottom: 24 }}>
          <h2>Всё в порядке</h2>
        </section>
      )}

      <section className="admin-section">
        <h2>Ingestion</h2>
        <dl>
          <dt>Последний weekly-news</dt>
          <dd>
            {latestSyncNews
              ? `${latestSyncNews.status} — завершён ${
                  latestSyncNews.finishedAt?.toISOString() ?? "—"
                }, попыток ${latestSyncNews.attempts}`
              : "—"}
          </dd>
          <dt>Прошло с последнего успеха</dt>
          <dd>{formatDuration(lastSuccessAge)}</dd>
          <dt>Последняя опубликованная статья</dt>
          <dd>
            {latestArticle
              ? `${latestArticle.publishedAt?.toISOString() ?? "—"} · ${latestArticle.slug}`
              : "—"}
          </dd>
          <dt>Опубликовано за 24 часа</dt>
          <dd>{articles24h}</dd>
        </dl>
      </section>

      <section className="admin-section">
        <h2>Очередь BackgroundJob</h2>
        <ul>
          {queueGroups.map((g) => (
            <li key={g.status}>
              {g.status}: {g._count._all}
            </li>
          ))}
        </ul>
        <h3>Последние задачи</h3>
        <table>
          <thead>
            <tr>
              <th>type</th>
              <th>status</th>
              <th>startedAt</th>
              <th>finishedAt</th>
              <th>attempts</th>
              <th>error</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map((j) => (
              <tr key={j.id}>
                <td>{j.type}</td>
                <td>{j.status}</td>
                <td>{j.startedAt?.toISOString() ?? ""}</td>
                <td>{j.finishedAt?.toISOString() ?? ""}</td>
                <td>{j.attempts}</td>
                <td>{j.errorMessage ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Инфраструктура</h2>
        <dl>
          <dt>APP_ROOT</dt>
          <dd>{resolveAppRoot()}</dd>
          <dt>process.cwd()</dt>
          <dd>{process.cwd()}</dd>
          <dt>.next/standalone symlinks</dt>
          <dd>
            <ul>
              {links.map((l) => (
                <li key={l.name}>
                  {l.name}: {l.exists ? (l.isSymlink ? `symlink → ${l.target}` : "COPY (не symlink!)") : "отсутствует"}
                </li>
              ))}
            </ul>
          </dd>
          <dt>Lock-файлы cron</dt>
          <dd>
            {locks.length === 0
              ? "—"
              : locks.map((l) => `${l.name} (mtime: ${l.mtime})`).join(", ")}
          </dd>
        </dl>
      </section>

      {hiddenArticles.length > 0 ? (
        <section className="admin-section">
          <h2>Скрытые published-статьи</h2>
          <table>
            <thead>
              <tr>
                <th>slug</th>
                <th>coverImageUrl</th>
              </tr>
            </thead>
            <tbody>
              {hiddenArticles.map((a) => (
                <tr key={a.id}>
                  <td>{a.slug}</td>
                  <td>{a.coverImageUrl ?? "(null)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="admin-section">
        <h2>Последние SystemEvent (warn/error)</h2>
        <table>
          <thead>
            <tr>
              <th>createdAt</th>
              <th>level</th>
              <th>category</th>
              <th>message</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.id}>
                <td>{e.createdAt.toISOString()}</td>
                <td>{e.level}</td>
                <td>{e.category}</td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
