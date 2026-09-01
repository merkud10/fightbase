import { prisma } from "@/lib/prisma";
import {
  resolveAthleteSlugAliases,
  type ResolveAthleteSlugAliasesOptions
} from "@/lib/ufc-athlete-slug";

const ATHLETE_FETCH_TIMEOUT_MS = 10_000;

// Тот же заголовок, что в lib/ufc-rankings.ts — держим их одинаковыми.
// Важнее заголовка транспорт: запрос обязан идти через fetch (undici).
// Нодовский https.get и curl Cloudflare отбивает по TLS-отпечатку — проверено
// на проде 01.09.2026: один и тот же user-agent, https.get даёт 403, fetch 200.
// Частые запросы подряд тоже ловят 403, поэтому резолв идёт с задержкой.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";

async function fetchAthleteHtml(slug: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.ufc.com/athlete/${encodeURIComponent(slug)}`, {
      headers: { "user-agent": UFC_USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(ATHLETE_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function resolveEnglishAthleteSlugs(
  slugs: string[],
  options: Partial<Pick<ResolveAthleteSlugAliasesOptions, "fetchHtml" | "budgetMs" | "concurrency">> = {}
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();

  const aliases = await prisma.ufcAthleteSlugAlias.findMany({
    where: { officialSlug: { in: slugs } },
    select: { officialSlug: true, englishSlug: true }
  });

  const known = new Map(aliases.map((alias) => [alias.officialSlug, alias.englishSlug]));

  const { resolved, discovered } = await resolveAthleteSlugAliases({
    slugs,
    known,
    fetchHtml: options.fetchHtml ?? fetchAthleteHtml,
    budgetMs: options.budgetMs,
    concurrency: options.concurrency
  });

  if (discovered.length > 0) {
    await prisma.ufcAthleteSlugAlias.createMany({
      data: discovered,
      skipDuplicates: true
    });
  }

  return resolved;
}
