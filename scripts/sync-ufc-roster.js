#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const {
  buildGenericBio,
  buildGenericBioEn,
  extractMetaContent,
  fetchJson,
  fetchText,
  normalizeCountry,
  parseArgs,
  parseMetricNumber,
  parseTextDate,
  saveRecentFights,
  slugify,
  stripTags,
  titleCase,
  transliterateName,
  getPreferredRussianName,
  hasMeaningfulRecord
} = require("./fighter-import-utils");

const prisma = new PrismaClient();

function pick(html, regex) {
  const match = html.match(regex);
  return stripTags(match?.[1] || "");
}

function pickBioField(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<div class="c-bio__label">${escapedLabel}<\\/div>[\\s\\S]*?<div class="c-bio__text">([\\s\\S]*?)<\\/div>`,
      "i"
    )
  );

  return stripTags(match?.[1] || "");
}

function parseInchesToCm(rawValue) {
  const match = String(rawValue || "").match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  return Math.round(Number(match[1]) * 2.54);
}

function normalizePhotoUrl(rawUrl) {
  const value = String(rawUrl || "").replace(/&amp;/g, "&").trim();
  if (!value || /no-profile-image/i.test(value)) {
    return null;
  }

  return value;
}

function parseUfcRosterEntries(html) {
  const chunks = html.split('<div class="c-listing-athlete-flipcard__inner">').slice(1);
  const entries = [];

  for (const chunk of chunks) {
    const slug = (chunk.match(/href="\/athlete\/([^"?#/]+)"/i) || [])[1];
    if (!slug) {
      continue;
    }

    const name = stripTags((chunk.match(/<span class="c-listing-athlete__name">\s*([^<]+)\s*<\/span>/i) || [])[1] || "");
    const recordRaw = stripTags((chunk.match(/<span class="c-listing-athlete__record">\s*([^<]+)\s*<\/span>/i) || [])[1] || "");
    const weightClass = stripTags((chunk.match(/<span class="c-listing-athlete__title">([\s\S]*?)<\/span>/i) || [])[1] || "");
    const imageMatches = [...chunk.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((match) => normalizePhotoUrl(match[1])).filter(Boolean);

    entries.push({
      slug,
      url: `https://www.ufc.com/athlete/${slug}`,
      name,
      record: hasMeaningfulRecord(recordRaw.replace(/\(W-L-D\)/i, "").replace(/\s+/g, "")) ? recordRaw.replace(/\(W-L-D\)/i, "").replace(/\s+/g, "") : "",
      weightClass: stripTags(weightClass),
      rosterPhotoUrl: imageMatches[0] || null
    });
  }

  return entries;
}

async function collectUfcRosterEntries() {
  const entriesBySlug = new Map();
  let page = 0;

  while (page < 200) {
    const html = await fetchText(`https://www.ufc.com/athletes/all?page=${page}`);
    const pageEntries = parseUfcRosterEntries(html);
    if (!pageEntries.length) {
      break;
    }

    for (const entry of pageEntries) {
      if (!entriesBySlug.has(entry.slug)) {
        entriesBySlug.set(entry.slug, entry);
      }
    }

    if (!html.includes(`href="?page=${page + 1}"`)) {
      break;
    }

    page += 1;
  }

  return [...entriesBySlug.values()];
}

function parseStatusTag(html, existingStatus) {
  const tags = [...html.matchAll(/<p class="hero-profile__tag">\s*([\s\S]*?)\s*<\/p>/gi)]
    .map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const tagText = tags.join(" | ");

  if (existingStatus === "champion" || /champion|title holder|interim/i.test(tagText)) {
    return "champion";
  }

  if (/retired|hall of fame|not fighting/i.test(tagText)) {
    return "retired";
  }

  if (/prospect|contender series|road to ufc/i.test(tagText)) {
    return "prospect";
  }

  if (/active/i.test(tagText)) {
    return "active";
  }

  return existingStatus === "prospect" ? "prospect" : "active";
}

function parseCompareStat(html, label) {
  const values = [...html.matchAll(/<div class="c-stat-compare__number">\s*([^<]+?)\s*(?:<div class="c-stat-compare__percent">%\s*<\/div>)?\s*<\/div>\s*<div class="c-stat-compare__label">([^<]+)<\/div>/gi)];
  const match = values.find((item) => stripTags(item[2]).toLowerCase() === label.toLowerCase());
  return stripTags(match?.[1] || "");
}

function parseCircleStat(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<title>[^<]*?${escapedLabel}[^<]*?(\\d+)%<\\/title>`, "i"));
  return stripTags(match?.[1] || "");
}

function parseCareerStat(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<p class="hero-profile__stat-numb">(\\d+)<\\/p>\\s*<p class="hero-profile__stat-text">${escapedLabel}<\\/p>`, "i")
  );

  return match ? Number(match[1]) : null;
}

function parseThreeBarStat(html, label) {
  const values = [...html.matchAll(/<div class="c-stat-3bar__label">([^<]+)<\/div>\s*<div class="c-stat-3bar__value">([^<]+)<\/div>/gi)];
  const match = values.find((item) => stripTags(item[1]).toLowerCase() === label.toLowerCase());
  const value = stripTags(match?.[2] || "");
  const numeric = value.match(/(\d+)/);
  return numeric ? Number(numeric[1]) : null;
}

function parseFloatValue(raw) {
  const match = String(raw || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeOpponentName(value) {
  return stripTags(String(value || ""))
    .replace(/^by\s+/i, "")
    .replace(/\s+(via|at|in)\b[\s\S]*$/i, "")
    .trim();
}

function parsePercentValue(raw) {
  const match = String(raw || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseUfcStatBlock(html) {
  return {
    winsByKnockout: parseCareerStat(html, "Wins by Knockout") ?? parseThreeBarStat(html, "KO/TKO"),
    winsBySubmission: parseCareerStat(html, "Wins by Submission") ?? parseThreeBarStat(html, "SUB"),
    winsByDecision: parseCareerStat(html, "Wins by Decision") ?? parseThreeBarStat(html, "DEC"),
    sigStrikesLandedPerMin: parseFloatValue(parseCompareStat(html, "Sig. Str. Landed")),
    strikeAccuracy: parsePercentValue(parseCircleStat(html, "Striking accuracy")),
    sigStrikesAbsorbedPerMin: parseFloatValue(parseCompareStat(html, "Sig. Str. Absorbed")),
    strikeDefense: parsePercentValue(parseCompareStat(html, "Sig. Str. Defense")),
    takedownAveragePer15: parseFloatValue(parseCompareStat(html, "Takedown avg")),
    takedownAccuracy: parsePercentValue(parseCircleStat(html, "Takedown Accuracy")),
    takedownDefense: parsePercentValue(parseCompareStat(html, "Takedown Defense")),
    submissionAveragePer15: parseFloatValue(parseCompareStat(html, "Submission avg")),
    averageFightTime: parseCompareStat(html, "Average fight time") || null
  };
}

function parseUfcProfile(html, slug, existing) {
  const name = pick(html, /hero-profile__name">([\s\S]*?)<\/h1>/i) || titleCase(slug.replace(/-/g, " "));
  const nickname = pick(html, /hero-profile__nickname">([\s\S]*?)<\/p>/i).replace(/^"+|"+$/g, "") || null;
  const division = pick(html, /hero-profile__division-title">([\s\S]*?)<\/p>/i).replace(/\s+Division$/i, "");
  const recordLine = pick(html, /hero-profile__division-body">([\s\S]*?)<\/p>/i);
  const record = recordLine.replace(/\(W-L-D\)/i, "").replace(/\s+/g, "");
  const normalizedRecord = hasMeaningfulRecord(record) ? record : existing?.record && hasMeaningfulRecord(existing.record) ? existing.record : "";
  const age = Number.parseInt(pick(html, /field--name-age[\s\S]*?field__item">([\s\S]*?)<\/div>/i), 10) || existing?.age || 0;
  const heightCm = parseInchesToCm(pickBioField(html, "Height")) || existing?.heightCm || 0;
  const reachCm = parseInchesToCm(pickBioField(html, "Reach")) || existing?.reachCm || 0;
  const placeOfBirth = pickBioField(html, "Place of Birth");
  const country = placeOfBirth.split(",").pop()?.trim() || existing?.country || "";
  const team = pickBioField(html, "Trains at") || existing?.team || "";
  const style = pickBioField(html, "Fighting style") || existing?.style || "MMA";
  const description = extractMetaContent(html, "description");
  const photoUrl = normalizePhotoUrl(extractMetaContent(html, "og:image")) || normalizePhotoUrl(pick(html, /hero-profile__image"[^>]+src="([^"]+)"/i)) || existing?.photoUrl || null;
  const koWins = pick(html, /hero-profile__stat-numb">(\d+)<\/p>\s*<p class="hero-profile__stat-text">Wins by Knockout/i);
  const subWins = pick(html, /hero-profile__stat-numb">(\d+)<\/p>\s*<p class="hero-profile__stat-text">Wins by Submission/i);
  const qnaFacts = pick(html, /field--name-qna-facts[\s\S]*?field__item">([\s\S]*?)<\/div>/i);
  const ufcStats = parseUfcStatBlock(html);

  let highlights = `${name ? transliterateName(name) : "Боец"} сохраняет заметную позицию в дивизионе UFC.`;
  if (koWins || subWins) {
    const statParts = [];
    if (koWins) statParts.push(`${koWins} побед нокаутом`);
    if (subWins) statParts.push(`${subWins} побед сабмишеном`);
    highlights = `В официальной статистике UFC у бойца отмечены ${statParts.join(" и ")}.`;
  } else if (qnaFacts) {
    const firstFact = qnaFacts
      .split(/\s{2,}|&nbsp;/)
      .map((item) => stripTags(item))
      .find(Boolean);
    if (firstFact) {
      highlights = `Официальный профиль UFC отдельно отмечает: ${firstFact}.`;
    }
  }

  return {
    slug,
    name,
    nameRu: getPreferredRussianName(name, existing?.nameRu),
    nickname,
    photoUrl,
    country: normalizeCountry(country),
    weightClass: division || existing?.weightClass || "Lightweight",
    status: parseStatusTag(html, existing?.status),
    record: normalizedRecord,
    age,
    heightCm,
    reachCm,
    ...ufcStats,
    team,
    style,
    bio:
      existing?.bio && existing.bio.length > 220 && !existing.bio.includes('"')
        ? existing.bio
        : buildGenericBio({
            nameRu: getPreferredRussianName(name, existing?.nameRu),
            promotionSlug: "ufc",
            country: normalizeCountry(country),
            weightClass: division,
            status: parseStatusTag(html, existing?.status),
            nickname,
            record: normalizedRecord,
            team,
            highlights,
            description
          }),
    bioEn:
      existing?.bioEn && existing.bioEn.length > 140
        ? existing.bioEn
        : buildGenericBioEn({
            name,
            promotionSlug: "ufc",
            country,
            weightClass: division,
            status: parseStatusTag(html, existing?.status),
            nickname,
            record: normalizedRecord,
            team,
            highlights: description || null,
            description
          })
  };
}

function parseUfcRecentFights(html, athleteSlug, athleteName, weightClass) {
  const prettifyEventName = (value) =>
    titleCase(value.replace(/-/g, " "))
      .replace(/\bUfc\b/g, "UFC")
      .replace(/\bEspn\b/g, "ESPN")
      .trim();

  const parsedCardFights = [];
  const sectionStart = html.indexOf('id="athlete-record"');
  if (sectionStart >= 0) {
    const sectionHtml = html.slice(sectionStart, sectionStart + 60000);
    const cards = [...sectionHtml.matchAll(/<article class="c-card-event--athlete-results">([\s\S]*?)<\/article>/gi)];

    for (const card of cards) {
      const cardHtml = card[1];
      const fighterLinks = [...cardHtml.matchAll(/https:\/\/www\.ufc\.com\/athlete\/([^"]+)/gi)].map((match) => match[1]);
      const fighterNames = [...cardHtml.matchAll(/<a href="https:\/\/www\.ufc\.com\/athlete\/[^"]+">([^<]+)<\/a>/gi)].map((match) => stripTags(match[1]));
      const fighterImageNames = [...cardHtml.matchAll(/<img[^>]+alt="([^"]+)"/gi)].map((match) => stripTags(match[1]));
      const resultRows = [...cardHtml.matchAll(/c-card-event--athlete-results__result-label">([^<]+)<\/div>\s*<div class="c-card-event--athlete-results__result-text">([^<]+)<\/div>/gi)];
      const dateText = pick(cardHtml, /c-card-event--athlete-results__date">([^<]+)<\/div>/i);
      const eventUrl = (cardHtml.match(/href="(https:\/\/www\.ufc\.com\/event\/[^"#?]+)(?:#[^"]*)?"/i) || [])[1] || "";
      const eventSlug = eventUrl.split("/event/")[1] || "";
      const eventName = prettifyEventName(eventSlug) || "UFC";
      const outcomePlaques = [...cardHtml.matchAll(/c-card-event--athlete-results__plaque\s+(win|loss|draw|nc)[^"]*">\s*([^<]+)\s*<\/div>/gi)].map((match) => ({
        statusClass: match[1].toLowerCase(),
        label: stripTags(match[2])
      }));

      if (!dateText || fighterLinks.length < 2 || fighterNames.length < 2) {
        continue;
      }

      const ourIndexByImage = fighterImageNames.findIndex((value) => value.toLowerCase() === athleteName.toLowerCase());
      const ourIndex = ourIndexByImage !== -1 ? ourIndexByImage : fighterLinks.findIndex((value) => value === athleteSlug);
      if (ourIndex === -1) {
        continue;
      }
      const opponentIndex = ourIndex === 0 ? 1 : 0;
      const opponentName = normalizeOpponentName(
        fighterImageNames[opponentIndex] ||
        fighterNames[opponentIndex] ||
        fighterImageNames.find((value, index) => index !== ourIndex && value) ||
        fighterNames.find((value, index) => index !== ourIndex && value) ||
        "Соперник не указан"
      );
      const outcome = outcomePlaques[ourIndex]?.label || outcomePlaques.find(Boolean)?.label || "";
      const mappedResult =
        /win/i.test(outcome) ? "Победа" : /loss/i.test(outcome) ? "Поражение" : /draw/i.test(outcome) ? "Ничья" : /nc/i.test(outcome) ? "Несостоявшийся бой" : "Результат уточняется";

      const resultMap = new Map(resultRows.map((match) => [stripTags(match[1]).toLowerCase(), stripTags(match[2])]));
      parsedCardFights.push({
        opponentName,
        eventName,
        result: mappedResult,
        method: resultMap.get("method") || null,
        date: parseTextDate(dateText),
        round: resultMap.get("round") ? Number(resultMap.get("round")) : null,
        time: resultMap.get("time") || null,
        weightClass,
        notes: null
      });
    }
  }

  const qnaMatch = html.match(/field--name-qna-ufc[\s\S]*?field__item">([\s\S]*?)<\/div>/i);
  const qnaRaw = qnaMatch?.[1] || "";
  const fights = [...parsedCardFights];
  if (!qnaRaw) {
    return fights;
  }
  const paragraphs = [...qnaRaw.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((match) => match[1]);

  for (const paragraph of paragraphs) {
    const eventName = stripTags((paragraph.match(/<strong>([\s\S]*?)<\/strong>/i) || [])[1] || "");
    const dateText = ((paragraph.match(/\((\d{1,2}\/\d{1,2}\/\d{2})\)/) || [])[1] || "").trim();
    const body = stripTags(paragraph.replace(/<strong>[\s\S]*?<\/strong>/i, "").replace(/\(\d{1,2}\/\d{1,2}\/\d{2}\)/, ""));
    if (!eventName || !dateText || !body) {
      continue;
    }
    const parsedDate = parseTextDate(
      dateText.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})/, (_, m, d, y) => {
        const year = Number(y) > 50 ? `19${y}` : `20${y}`;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[Number(m) - 1]} ${d} ${year}`;
      })
    );

    const result = /won|stopped|submitted|scored/i.test(body)
      ? "Победа"
      : /disqualified|lost|was defeated|was stopped|was knocked out|was submitted/i.test(body)
        ? "Поражение"
          : /no contest/i.test(body)
          ? "Несостоявшийся бой"
          : "Результат уточняется";

    const opponentPattern =
      /(?:over|against|submitted|stopped|by|to)\s+([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})(?=\s+(?:via|at|in|to)\b|\.|$)/i;
    const opponentMatch = body.match(opponentPattern);
    const opponentName = normalizeOpponentName(opponentMatch?.[1] || "Соперник не указан");

    const roundMatch = body.match(/(?:round|R)(?:\s|\.?)(\d+)/i);
    const timeMatch = body.match(/at\s+(\d:\d{2})/i);
    const methodMatch =
      body.match(/via ([^.]+?)(?: at|\.|$)/i) ||
      body.match(/won a ([^.]+?decision)(?: over| to|\.|$)/i) ||
      body.match(/lost a ([^.]+?decision)(?: to| over|\.|$)/i) ||
      body.match(/scored a ([^.]+?decision)(?: over| to|\.|$)/i) ||
      body.match(/stopped [^.]+ via ([^.]+?)(?: at|\.|$)/i) ||
      body.match(/was disqualified/i);
    const decisionRoundMatch = body.match(/(three|five)\s+round/i);
    let derivedRound = roundMatch ? Number(roundMatch[1]) : null;
    let derivedTime = timeMatch?.[1] || null;

    if (!derivedRound && /decision/i.test(methodMatch?.[1] || methodMatch?.[0] || "")) {
      derivedRound = decisionRoundMatch?.[1]?.toLowerCase() === "five" ? 5 : 3;
    }
    if (!derivedTime && /decision/i.test(methodMatch?.[1] || methodMatch?.[0] || "")) {
      derivedTime = "5:00";
    }

    fights.push({
      opponentName,
      eventName,
      result,
      method:
        stripTags(methodMatch?.[1] || methodMatch?.[0] || "")
          .replace(/^won a\s+/i, "")
          .replace(/^scored a\s+/i, "")
          .replace(/^via\s+/i, "")
          .replace(/was disqualified/gi, "disqualification") || null,
      date: parsedDate,
      round: derivedRound,
      time: derivedTime,
      weightClass,
      notes: body
    });
  }

  const deduped = [];
  const seen = new Set();
  const normalizeKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, " ")
      .trim();
  for (const fight of fights) {
    const dateKey = fight.date ? new Date(fight.date).getUTCFullYear() : "no-date";
    const eventKey = normalizeKey(fight.eventName);
    const opponentKey = normalizeKey(fight.opponentName).split(" ").slice(-1)[0] || normalizeKey(fight.opponentName);
    const key = `${dateKey}:${eventKey}:${opponentKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(fight);
  }

  return deduped.sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : 0;
    const rightTime = right.date ? new Date(right.date).getTime() : 0;
    return rightTime - leftTime;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;
  const singleSlug = typeof args.slug === "string" ? String(args.slug).trim().replace(/^\/+|\/+$/g, "") : "";

  const promotion = await prisma.promotion.findUnique({
    where: { slug: "ufc" }
  });

  if (!promotion) {
    throw new Error("Promotion ufc not found");
  }

  const entries = singleSlug ? [{ slug: singleSlug, url: `https://www.ufc.com/athlete/${singleSlug}`, rosterPhotoUrl: null }] : await collectUfcRosterEntries();
  const scopedEntries = singleSlug ? entries : entries.slice(offset, limit ? offset + limit : undefined);
  let created = 0;
  let updated = 0;

  console.log(`Found ${entries.length} UFC roster entries. Processing ${scopedEntries.length}.`);

  for (const entry of scopedEntries) {
    try {
      const { slug, url } = entry;
      const existing = await prisma.fighter.findUnique({
        where: { slug },
        include: { recentFights: true }
      });

      const html = await fetchText(url);
      const profile = parseUfcProfile(html, slug, existing);

      const data = {
        slug: profile.slug,
        name: profile.name,
        nameRu: profile.nameRu,
        nickname: profile.nickname,
        photoUrl: profile.photoUrl || entry.rosterPhotoUrl || existing?.photoUrl || null,
        country: profile.country,
        weightClass: titleCase(profile.weightClass),
        status: profile.status,
        record: profile.record,
        age: profile.age,
        heightCm: profile.heightCm,
        reachCm: profile.reachCm,
        winsByKnockout: profile.winsByKnockout,
        winsBySubmission: profile.winsBySubmission,
        winsByDecision: profile.winsByDecision,
        sigStrikesLandedPerMin: profile.sigStrikesLandedPerMin,
        strikeAccuracy: profile.strikeAccuracy,
        sigStrikesAbsorbedPerMin: profile.sigStrikesAbsorbedPerMin,
        strikeDefense: profile.strikeDefense,
        takedownAveragePer15: profile.takedownAveragePer15,
        takedownAccuracy: profile.takedownAccuracy,
        takedownDefense: profile.takedownDefense,
        submissionAveragePer15: profile.submissionAveragePer15,
        averageFightTime: profile.averageFightTime,
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

      const recentFights = parseUfcRecentFights(html, slug, data.name, data.weightClass);
      await saveRecentFights(prisma, fighter.id, recentFights);

      if (existing) {
        updated += 1;
        console.log(`Updated UFC fighter: ${fighter.name}`);
      } else {
        created += 1;
        console.log(`Created UFC fighter: ${fighter.name}`);
      }
    } catch (error) {
      console.error(`Failed UFC sync for ${url}: ${error.message || error}`);
    }
  }

  if (!singleSlug) {
    const currentRosterSlugs = entries.map((entry) => entry.slug);
    const retired = await prisma.fighter.updateMany({
      where: {
        promotionId: promotion.id,
        slug: { notIn: currentRosterSlugs },
        status: { in: ["active", "prospect", "champion"] }
      },
      data: {
        status: "retired"
      }
    });
    console.log(`Marked ${retired.count} UFC fighters outside the current roster as retired.`);
  }

  console.log(`UFC sync complete. Created: ${created}. Updated: ${updated}.`);
}

module.exports = {
  collectUfcRosterEntries,
  normalizePhotoUrl,
  parseStatusTag,
  parseUfcProfile,
  parseUfcRecentFights,
  parseUfcStatBlock,
  main
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
