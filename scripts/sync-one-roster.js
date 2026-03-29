#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const {
  buildGenericBio,
  buildGenericBioEn,
  extractMetaContent,
  fetchText,
  normalizeCountry,
  parseArgs,
  parseLbsWeightToClass,
  parseMetricNumber,
  parseUnixDate,
  saveRecentFights,
  stripTags,
  titleCase,
  transliterateName,
  hasMeaningfulRecord
} = require("./fighter-import-utils");

const prisma = new PrismaClient();

function collectOneAthleteUrlsFromPage(html) {
  return [
    ...new Set(
      [...html.matchAll(/href="(https:\/\/www\.onefc\.com\/athletes\/[^"?#]+\/)"/g)]
        .map((match) => match[1])
        .filter((url) => !/\/athletes\/(?:martial-art|country)\//.test(url))
    )
  ];
}

async function collectOneAthleteUrls() {
  const urls = new Set();

  for (let page = 1; page <= 6; page += 1) {
    const url =
      page === 1
        ? "https://www.onefc.com/athletes/martial-art/mma/"
        : `https://www.onefc.com/athletes/martial-art/mma/page/${page}/`;

    try {
      const html = await fetchText(url);
      const found = collectOneAthleteUrlsFromPage(html);
      if (found.length === 0) {
        break;
      }

      for (const athleteUrl of found) {
        urls.add(athleteUrl);
      }
    } catch (error) {
      if (page === 1) {
        throw error;
      }
      break;
    }
  }

  return [...urls];
}

function pickAttribute(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<h5 class="title">${escaped}<\\/h5>[\\s\\S]*?<div class="value">([\\s\\S]*?)<\\/div>`, "i");
  return stripTags((html.match(regex) || [])[1] || "");
}

function parseOneRecentFights(html, weightClass) {
  const tableMatch = html.match(/<div class="athlete-event-results">([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return [];
  }

  const rows = [...tableMatch[1].matchAll(/<tr class="is-data-row">([\s\S]*?)<\/tr>/g)].slice(0, 3);

  return rows.map((row) => {
    const content = row[1];
    const resultRaw = stripTags((content.match(/<div class="is-distinct [^"]+">([\s\S]*?)<\/div>/i) || [])[1] || "");
    const opponentName = stripTags((content.match(/<td class="opponent">[\s\S]*?<h5 class="fs-100 m-0">([\s\S]*?)<\/h5>/i) || [])[1] || "Соперник");
    const eventName = stripTags((content.match(/<td class="event[\s\S]*?<h5 class="fs-100 m-0">([\s\S]*?)<\/h5>/i) || [])[1] || "ONE Championship");
    const method = stripTags((content.match(/<td class="method[\s\S]*?>\s*([^<]+)/i) || [])[1] || "");
    const roundTime = stripTags((content.match(/<td class="round[\s\S]*?>\s*([^<]+)/i) || [])[1] || "");
    const timestamp = (content.match(/data-timestamp="(\d+)"/i) || [])[1];
    const roundMatch = roundTime.match(/R(\d+)/i);
    const timeMatch = roundTime.match(/\((\d:\d{2})\)/i);

    return {
      opponentName,
      eventName,
      result:
        resultRaw.includes("WIN")
          ? "Победа"
          : resultRaw.includes("LOSS")
            ? "Поражение"
            : resultRaw.includes("NC")
              ? "Несостоявшийся бой"
              : stripTags(resultRaw),
      method: method && method !== "-" ? method : null,
      date: parseUnixDate(timestamp),
      round: roundMatch ? Number(roundMatch[1]) : null,
      time: timeMatch?.[1] || null,
      weightClass,
      notes: null
    };
  });
}

function parseOneProfile(html, slug, existing) {
  const rawTitle = extractMetaContent(html, "og:title") || titleCase(slug.replace(/-/g, " "));
  const pageName = stripTags(
    rawTitle
      .replace(/\s*-\s*ONE Championship[\s\S]*$/i, "")
      .replace(/\s+MMA Stats, News, Videos\s*,?and More$/i, "")
  );
  const nicknameMatch = pageName.match(/[“"]([^”"]+)[”"]/) || pageName.match(/"([^"]+)"/);
  const name = pageName.replace(/[“"][^”"]+[”"]/g, "").replace(/\s+/g, " ").trim();
  const nickname = nicknameMatch?.[1]?.trim() || existing?.nickname || null;
  const countryValue = pickAttribute(html, "Country");
  const team = pickAttribute(html, "Team") || existing?.team || "ONE Championship";
  const age = Number.parseInt(pickAttribute(html, "Age"), 10) || existing?.age || 30;
  const heightCm = parseMetricNumber(pickAttribute(html, "Height")) || existing?.heightCm || 180;
  const weightClass = titleCase(existing?.weightClass || parseLbsWeightToClass(pickAttribute(html, "Weight Limit")) || "Lightweight");
  const photoUrl = extractMetaContent(html, "og:image") || existing?.photoUrl || null;
  const description = extractMetaContent(html, "description") || extractMetaContent(html, "og:description");
  const recentFightHeadline = stripTags((html.match(/<div class="record-cell[\s\S]*?<h4 class="title">Event Results<\/h4>/i) || [])[0] || "");
  const country = countryValue.split("/")[0].trim() || existing?.country || "Unknown";
  const highlights = description
    ? `Официальный профиль ONE отмечает бойца как одну из заметных фигур дивизиона и подчеркивает его соревновательный путь в организации.`
    : recentFightHeadline
      ? "В официальном профиле ONE уже отражены недавние выступления и статистика по главным поединкам."
      : null;

  const recordText = existing?.record && hasMeaningfulRecord(existing.record) ? existing.record : "";

  return {
    slug,
    name,
    nameRu: existing?.nameRu || transliterateName(name),
    nickname,
    photoUrl,
    country: normalizeCountry(country),
    weightClass,
    status: existing?.status || "active",
    record: recordText,
    age,
    heightCm,
    reachCm: existing?.reachCm || heightCm,
    team,
    style: existing?.style || "MMA",
    bio:
      existing?.bio && existing.bio.length > 220
        ? existing.bio
        : buildGenericBio({
            nameRu: existing?.nameRu || transliterateName(name),
            promotionSlug: "one",
            country: normalizeCountry(country),
            weightClass,
            status: existing?.status || "active",
            nickname,
            record: recordText,
            team,
            highlights,
            description
          }),
    bioEn:
      existing?.bioEn && existing.bioEn.length > 140
        ? existing.bioEn
        : buildGenericBioEn({
            name,
            promotionSlug: "one",
            country,
            weightClass,
            status: existing?.status || "active",
            nickname,
            record: recordText,
            team,
            highlights: description || null,
            description
          })
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;

  const promotion = await prisma.promotion.findUnique({
    where: { slug: "one" }
  });

  if (!promotion) {
    throw new Error("Promotion one not found");
  }

  const urls = await collectOneAthleteUrls();
  const scopedUrls = urls.slice(offset, limit ? offset + limit : undefined);
  let created = 0;
  let updated = 0;

  console.log(`Found ${urls.length} ONE athlete URLs. Processing ${scopedUrls.length}.`);

  for (const url of scopedUrls) {
    try {
      const slug = url.split("/athletes/")[1].replace(/\/+$/, "");
      const existing = await prisma.fighter.findUnique({
        where: { slug },
        include: { recentFights: true }
      });

      const html = await fetchText(url);
      const profile = parseOneProfile(html, slug, existing);

      const data = {
        slug: profile.slug,
        name: profile.name,
        nameRu: profile.nameRu,
        nickname: profile.nickname,
        photoUrl: profile.photoUrl,
        country: profile.country,
        weightClass: profile.weightClass,
        status: profile.status,
        record: profile.record,
        age: profile.age,
        heightCm: profile.heightCm,
        reachCm: profile.reachCm,
        team: profile.team,
        style: profile.style,
        bio: profile.bio,
        bioEn: profile.bioEn,
        promotionId: promotion.id
      };

      const fighter = existing
        ? await prisma.fighter.update({
            where: { id: existing.id },
            data
          })
        : await prisma.fighter.create({
            data
          });

      await saveRecentFights(prisma, fighter.id, parseOneRecentFights(html, data.weightClass));

      if (existing) {
        updated += 1;
        console.log(`Updated ONE fighter: ${fighter.name}`);
      } else {
        created += 1;
        console.log(`Created ONE fighter: ${fighter.name}`);
      }
    } catch (error) {
      console.error(`Failed ONE sync for ${url}: ${error.message || error}`);
    }
  }

  console.log(`ONE sync complete. Created: ${created}. Updated: ${updated}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
