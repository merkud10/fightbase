import { prisma } from "@/lib/prisma";
import {
  resolveAthleteSlugAliases,
  type ResolveAthleteSlugAliasesOptions
} from "@/lib/ufc-athlete-slug";

const ATHLETE_FETCH_TIMEOUT_MS = 10_000;

// Cloudflare на ufc.com отдаёт 403 на реалистичный браузерный user-agent и
// пропускает вот этот. Тот же заголовок используется в lib/ufc-rankings.ts.
// Не менять.
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
