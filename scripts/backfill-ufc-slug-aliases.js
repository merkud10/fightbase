#!/usr/bin/env node

// Прогревает таблицу UfcAthleteSlugAlias по текущему снимку рейтингов, чтобы
// не ждать, пока кэш наполнится за несколько запусков крона. Идемпотентен:
// уже известные слаги пропускаются.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ATHLETE_FETCH_TIMEOUT_MS = 10_000;
// Тот же user-agent, что в lib/ufc-rankings.ts. Браузерный получает 403.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";

function extractEnglishAthleteSlug(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bhreflang=["']en["']/i.test(tag)) continue;

    const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    const slug = href && (href.match(/\/athlete\/([^"'/?#]+)/i) || [])[1];
    if (slug) return slug;
  }

  return null;
}

async function fetchAthleteHtml(slug) {
  const response = await fetch(`https://www.ufc.com/athlete/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": UFC_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(ATHLETE_FETCH_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function collectSlugs(groups) {
  const slugs = new Set();

  for (const group of groups) {
    if (group.champion && group.champion.officialSlug) slugs.add(group.champion.officialSlug);
    for (const row of group.rows || []) {
      if (row.officialSlug) slugs.add(row.officialSlug);
    }
  }

  return [...slugs];
}

async function main() {
  const snapshot = await prisma.ufcRankingSnapshot.findUnique({
    where: { key: "ufc-official-rankings" },
    select: { payload: true }
  });

  if (!snapshot) throw new Error("Снимок рейтингов не найден. Сначала обнови рейтинги.");

  const slugs = collectSlugs(JSON.parse(snapshot.payload));
  const existing = await prisma.ufcAthleteSlugAlias.findMany({
    where: { officialSlug: { in: slugs } },
    select: { officialSlug: true }
  });
  const known = new Set(existing.map((alias) => alias.officialSlug));
  const pending = slugs.filter((slug) => !known.has(slug));

  console.log(`Слагов в снимке: ${slugs.length}, уже известно: ${known.size}, к резолву: ${pending.length}`);

  let resolved = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const slug = pending[cursor++];

      try {
        const englishSlug = extractEnglishAthleteSlug(await fetchAthleteHtml(slug));

        if (!englishSlug) {
          failed += 1;
          console.warn(`  ${slug}: hreflang=en не найден`);
          continue;
        }

        await prisma.ufcAthleteSlugAlias.upsert({
          where: { officialSlug: slug },
          create: { officialSlug: slug, englishSlug },
          update: { englishSlug }
        });
        resolved += 1;
        console.log(`  ${slug} -> ${englishSlug}`);
      } catch (error) {
        failed += 1;
        console.warn(`  ${slug}: ${error.message || error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker));

  console.log(`Готово. Разрешено: ${resolved}, не удалось: ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
