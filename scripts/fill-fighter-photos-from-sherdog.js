#!/usr/bin/env node

// Добор фото из Sherdog для бойцов ближайших турниров, у которых после ESPN
// нет пригодного портрета: новички Dana White's Contender Series и замены на
// коротком уведомлении. ESPN остаётся основным источником, Sherdog — запасной.
// Спека: docs/superpowers/specs/2026-09-06-sherdog-photo-fallback-design.md
//
// Запуск: node scripts/fill-fighter-photos-from-sherdog.js [--days-back 1]
//   [--days-forward 10] [--event <slug>] [--fighter-slug <slug>] [--limit N] [--apply]
// Без --apply — сухой прогон: печатает, что нашёл бы, БД и диск не трогает.
// Ежедневный крон: cron-tasks.sh sync-photos-upcoming.

const { PrismaClient } = require("@prisma/client");

const { hasUsablePhoto } = require("./espn-enrich");
const { fetchText, parseArgs } = require("./fighter-import-utils");
const { persistImageLocally } = require("./local-image-store");
const {
  SHERDOG_ORIGIN,
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
} = require("./sherdog-utils");

const prisma = new PrismaClient();

const DAYS_BACK = 1;
const DAYS_FORWARD = 10;
const REQUEST_DELAY_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

const FIGHTER_SELECT = { id: true, slug: true, name: true, record: true, heightCm: true, photoUrl: true };
// Заглушки неанонсированных соперников (DWCS на несколько недель вперёд).
const PLACEHOLDER_SLUGS = new Set(["tba", "opponent-tba"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectFighters({ daysBack, daysForward, eventSlug, fighterSlug, limit }) {
  if (fighterSlug) {
    const fighter = await prisma.fighter.findUnique({ where: { slug: fighterSlug }, select: FIGHTER_SELECT });
    return fighter ? [fighter] : [];
  }

  const where = eventSlug
    ? { slug: eventSlug }
    : { date: { gte: new Date(Date.now() - daysBack * DAY_MS), lte: new Date(Date.now() + daysForward * DAY_MS) } };

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: "asc" },
    select: {
      fights: {
        select: { fighterA: { select: FIGHTER_SELECT }, fighterB: { select: FIGHTER_SELECT } }
      }
    }
  });

  const seen = new Set();
  const fighters = [];
  for (const event of events) {
    for (const fight of event.fights) {
      for (const fighter of [fight.fighterA, fight.fighterB]) {
        if (!fighter || seen.has(fighter.id) || PLACEHOLDER_SLUGS.has(fighter.slug)) {
          continue;
        }
        seen.add(fighter.id);
        if (!hasUsablePhoto(fighter.photoUrl)) {
          fighters.push(fighter);
        }
      }
    }
  }

  return limit ? fighters.slice(0, limit) : fighters;
}

async function resolvePhoto(fighter) {
  const searchHtml = await fetchText(buildSearchUrl(fighter.name));
  const picked = pickSearchCandidate(fighter, parseSearchResults(searchHtml));
  if (!picked.row) {
    return { status: picked.reason, detail: picked.candidates ? `${picked.candidates} кандидатов` : "" };
  }

  await sleep(REQUEST_DELAY_MS);
  const page = parseFighterPage(await fetchText(`${SHERDOG_ORIGIN}${picked.row.path}`));
  const rejection = verifyFighterPage(fighter, page);
  if (rejection) {
    return { status: "skipped", detail: `${rejection} (${picked.row.path})` };
  }

  return { status: "found", path: picked.row.path, sourceUrls: buildPhotoSourceUrls(page.photoPath) };
}

async function persistPhoto(fighter, sourceUrls) {
  let lastError = null;
  for (const sourceUrl of sourceUrls) {
    try {
      const localUrl = await persistImageLocally({ bucket: "fighters", key: fighter.slug, sourceUrl });
      if (localUrl) {
        return localUrl;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no photo source urls");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const limit = Number(args.limit || 0) || null;
  const daysBack = args["days-back"] === undefined ? DAYS_BACK : Math.max(0, Number(args["days-back"]) || 0);
  const daysForward =
    args["days-forward"] === undefined ? DAYS_FORWARD : Math.max(1, Number(args["days-forward"]) || DAYS_FORWARD);
  const eventSlug = String(args.event || "").trim();
  const fighterSlug = String(args["fighter-slug"] || "").trim();

  const fighters = await selectFighters({ daysBack, daysForward, eventSlug, fighterSlug, limit });
  const scope = fighterSlug || eventSlug || `−${daysBack}/+${daysForward} days`;
  console.log(`Fighters without usable photo (${scope}): ${fighters.length}${apply ? "" : " (dry run)"}`);

  const counters = { updated: 0, unmatched: 0, ambiguous: 0, skipped: 0, failed: 0 };

  for (const fighter of fighters) {
    try {
      const result = await resolvePhoto(fighter);
      if (result.status !== "found") {
        counters[result.status] += 1;
        console.log(`[${result.status}] ${fighter.slug}${result.detail ? `: ${result.detail}` : ""}`);
      } else if (!apply) {
        counters.updated += 1;
        console.log(`[would update] ${fighter.slug} ← ${result.path}`);
      } else {
        const photoUrl = await persistPhoto(fighter, result.sourceUrls);
        await prisma.fighter.update({ where: { id: fighter.id }, data: { photoUrl } });
        counters.updated += 1;
        console.log(`[updated] ${fighter.slug} ← ${result.path} → ${photoUrl}`);
      }
    } catch (error) {
      counters.failed += 1;
      console.warn(`[failed] ${fighter.slug}: ${error.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(
    `Summary: updated=${counters.updated} unmatched=${counters.unmatched} ambiguous=${counters.ambiguous} skipped=${counters.skipped} failed=${counters.failed}${apply ? "" : " (dry run: planned results)"}`
  );

  // Только полный провал (Sherdog недоступен) должен ронять cron-задачу.
  if (fighters.length > 0 && counters.failed === fighters.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
