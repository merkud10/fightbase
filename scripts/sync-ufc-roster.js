#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { persistImageLocally } = require("./local-image-store");

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
  hasMeaningfulRecord,
  localizeUfcFighterProfileWithDeepSeek
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

function sanitizeTeam(value) {
  const clean = stripTags(String(value || ""))
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\bMikwaukee\b/gi, "Milwaukee")
    .replace(/\bFintess\b/gi, "Fitness")
    .trim();

  if (!clean || /^(unknown|n\/a|none|tbd|not available|ufc performance institute)$/i.test(clean)) {
    return "";
  }

  return clean;
}

function sanitizeStyle(value) {
  const clean = stripTags(String(value || ""))
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!clean || /stats|profile|news|read more|view complete/i.test(clean) || clean.length > 80) {
    return "MMA";
  }

  return clean;
}

function shouldReuseExistingBioRu(value) {
  const clean = stripTags(String(value || "")).replace(/\s+/g, " ").trim();
  if (!clean) {
    return false;
  }

  return clean.length > 220 && !/\(В-П-Н\)|сохраняет заметную позицию в дивизионе|на текущий момент входит в число чемпионов своей организации|сейчас значится вне активных выступлений/i.test(clean);
}

function shouldReuseExistingBioEn(value) {
  const clean = stripTags(String(value || "")).replace(/\s+/g, " ").trim();
  if (!clean) {
    return false;
  }

  return clean.length > 220 && !/[А-Яа-яЁё]/.test(clean) && !/stats, fight results, news|currently holds championship status in the promotion|currently listed outside active competition/i.test(clean);
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

  if (/champion|title holder|interim/i.test(tagText)) {
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

function normalizeFightPersonKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function isSelfOpponentName(opponentName, athleteSlug, athleteName) {
  const normalizedOpponent = normalizeFightPersonKey(opponentName);
  if (!normalizedOpponent) {
    return false;
  }

  const athleteSlugKey = normalizeFightPersonKey(String(athleteSlug || "").replace(/-/g, " "));
  const athleteNameKey = normalizeFightPersonKey(athleteName);
  const athleteLastNameKey = athleteNameKey.split(" ").filter(Boolean).slice(-1)[0] || "";

  return (
    normalizedOpponent === athleteSlugKey ||
    normalizedOpponent === athleteNameKey ||
    (athleteLastNameKey && normalizedOpponent === athleteLastNameKey)
  );
}

function isPlaceholderRecentFightValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "opponent not listed",
    "result pending",
    "соперник не указан",
    "результат уточняется"
  ].includes(normalized);
}

function isValidRecentFight(fight) {
  if (!fight) {
    return false;
  }

  if (isPlaceholderRecentFightValue(fight.opponentName) || isPlaceholderRecentFightValue(fight.result)) {
    return false;
  }

  if (!String(fight.eventName || "").trim()) {
    return false;
  }

  return true;
}

function inferResultFromNotes(notes) {
  const text = String(notes || "").toLowerCase();

  if (!text) {
    return "";
  }

  if (/won|stopped|submitted|scored/i.test(text)) {
    return "Победа";
  }

  if (/disqualified|lost|was defeated|was stopped|was knocked out|was submitted/i.test(text)) {
    return "Поражение";
  }

  if (/no contest/i.test(text)) {
    return "Несостоявшийся бой";
  }

  return "";
}

function getRecentFightSourceRank(fight) {
  if (String(fight.notes || "").trim()) {
    return 3;
  }

  if (String(fight.method || "").trim()) {
    return 2;
  }

  return 1;
}

function choosePreferredFightResult(left, right) {
  const leftFromNotes = inferResultFromNotes(left.notes);
  const rightFromNotes = inferResultFromNotes(right.notes);

  if (leftFromNotes && !rightFromNotes) {
    return leftFromNotes;
  }

  if (rightFromNotes && !leftFromNotes) {
    return rightFromNotes;
  }

  if (leftFromNotes && rightFromNotes) {
    return getRecentFightSourceRank(right) >= getRecentFightSourceRank(left) ? rightFromNotes : leftFromNotes;
  }

  if (!left.result) return right.result;
  if (!right.result) return left.result;
  if (left.result === right.result) return left.result;

  return getRecentFightSourceRank(right) >= getRecentFightSourceRank(left) ? right.result : left.result;
}

function mergeParsedRecentFight(base, incoming) {
  return {
    opponentName: incoming.opponentName.length > base.opponentName.length ? incoming.opponentName : base.opponentName,
    eventName: incoming.eventName.length > base.eventName.length ? incoming.eventName : base.eventName,
    result: choosePreferredFightResult(base, incoming),
    method: String(incoming.method || "").trim() || base.method || null,
    date: incoming.date && (!base.date || new Date(incoming.date).getTime() >= new Date(base.date).getTime()) ? incoming.date : base.date,
    round: incoming.round || base.round || null,
    time: incoming.time || base.time || null,
    weightClass: incoming.weightClass || base.weightClass || null,
    notes: String(incoming.notes || "").trim() ? incoming.notes : base.notes
  };
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
  const team = sanitizeTeam(pickBioField(html, "Trains at")) || sanitizeTeam(existing?.team) || "";
  const style = sanitizeStyle(pickBioField(html, "Fighting style")) || sanitizeStyle(existing?.style) || "MMA";
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
      shouldReuseExistingBioRu(existing?.bio)
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
      shouldReuseExistingBioEn(existing?.bioEn)
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
            highlights: null,
            description
          })
  };
}

async function enrichProfileWithDeepSeek(profile) {
  const localized = await localizeUfcFighterProfileWithDeepSeek({
    name: profile.name,
    nickname: profile.nickname,
    country: profile.country,
    weightClass: profile.weightClass,
    status: profile.status,
    record: profile.record,
    team: profile.team,
    style: profile.style,
    highlights: profile.bio,
    description: profile.bioEn
  });

  return {
    ...profile,
    nameRu: localized.nameRu,
    bio: localized.bioRu
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
      const parsedFight = {
        opponentName,
        eventName,
        result: mappedResult,
        method: resultMap.get("method") || null,
        date: parseTextDate(dateText),
        round: resultMap.get("round") ? Number(resultMap.get("round")) : null,
        time: resultMap.get("time") || null,
        weightClass,
        notes: null
      };

      if (isValidRecentFight(parsedFight) && !isSelfOpponentName(parsedFight.opponentName, athleteSlug, athleteName)) {
        parsedCardFights.push(parsedFight);
      }
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

    const parsedFight = {
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
    };

    if (isValidRecentFight(parsedFight) && !isSelfOpponentName(parsedFight.opponentName, athleteSlug, athleteName)) {
      fights.push(parsedFight);
    }
  }

  const deduped = new Map();
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
    const existing = deduped.get(key);
    deduped.set(key, existing ? mergeParsedRecentFight(existing, fight) : fight);
  }

  return [...deduped.values()]
    .filter((fight) => isValidRecentFight(fight))
    .sort((left, right) => {
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
  const useDeepSeek = args.deepseek === "false" ? false : true;

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
      const { fighter, created: wasCreated } = await syncUfcRosterEntry(prisma, promotion, entry, { useDeepSeek });

      if (wasCreated) {
        created += 1;
        console.log(`Created UFC fighter: ${fighter.name}`);
      } else {
        updated += 1;
        console.log(`Updated UFC fighter: ${fighter.name}`);
      }
    } catch (error) {
      console.error(`Failed UFC sync for ${entry.url || entry.slug}: ${error.message || error}`);
    }
  }

  console.log(`UFC sync complete. Created: ${created}. Updated: ${updated}.`);
}

async function syncUfcRosterEntry(prismaClient, promotion, entry, options = {}) {
  const { slug, url } = entry;
  const useDeepSeek = options.useDeepSeek !== false;
  const existing = await prismaClient.fighter.findUnique({
    where: { slug },
    include: { recentFights: true }
  });

  const html = await fetchText(url);
  let profile = parseUfcProfile(html, slug, existing);

  if (useDeepSeek) {
    try {
      profile = await enrichProfileWithDeepSeek(profile);
    } catch (error) {
      console.error(`DeepSeek fighter localization failed for ${slug}: ${error.message || error}`);
    }
  }

  const localizedPhotoUrl = await persistImageLocally({
    bucket: "fighters",
    key: slug,
    sourceUrl: profile.photoUrl || entry.rosterPhotoUrl || existing?.photoUrl || null
  }).catch(() => profile.photoUrl || entry.rosterPhotoUrl || existing?.photoUrl || null);

  const data = {
    slug: profile.slug,
    name: profile.name,
    nameRu: profile.nameRu,
    nickname: profile.nickname,
    photoUrl: localizedPhotoUrl,
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
    ? await prismaClient.fighter.update({
        where: { id: existing.id },
        data
      })
    : await prismaClient.fighter.create({
        data
      });

  const recentFights = parseUfcRecentFights(html, slug, data.name, data.weightClass);
  await saveRecentFights(prismaClient, fighter.id, recentFights);

  return {
    fighter,
    created: !existing
  };
}

async function syncUfcFighterBySlug(prismaClient, slug, options = {}) {
  const normalizedSlug = String(slug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedSlug) {
    throw new Error("UFC slug is required");
  }

  const promotion = await prismaClient.promotion.findUnique({
    where: { slug: "ufc" }
  });

  if (!promotion) {
    throw new Error("Promotion ufc not found");
  }

  return syncUfcRosterEntry(prismaClient, promotion, {
    slug: normalizedSlug,
    url: `https://www.ufc.com/athlete/${normalizedSlug}`,
    rosterPhotoUrl: null
  }, options);
}

module.exports = {
  collectUfcRosterEntries,
  normalizePhotoUrl,
  parseStatusTag,
  parseUfcProfile,
  parseUfcRecentFights,
  parseUfcStatBlock,
  syncUfcFighterBySlug,
  syncUfcRosterEntry,
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
