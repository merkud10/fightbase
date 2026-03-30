#!/usr/bin/env node

const https = require("https");
const { PrismaClient } = require("@prisma/client");

const {
  buildGenericBio,
  buildGenericBioEn,
  fetchText,
  getPreferredRussianName,
  hasMeaningfulRecord,
  normalizeCountry,
  parseArgs,
  parseTextDate,
  saveRecentFights,
  slugify,
  stripTags,
  titleCase,
  transliterateName
} = require("./fighter-import-utils");

const prisma = new PrismaClient();

const ROSTER_URL = "https://pflmma.com/all-fighter-roster";

function normalizeSourceSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%[0-9a-f]{2}/gi, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function inchesToCm(rawValue) {
  const match = String(rawValue || "").match(/(\d+(?:\.\d+)?)\s*"/);
  if (!match) {
    return null;
  }

  return Math.round(Number(match[1]) * 2.54);
}

function feetInchesToCm(rawValue) {
  const clean = stripTags(rawValue);
  const match = clean.match(/(\d+)\s*'\s*(\d+)(?:\s*"|$)/);
  if (!match) {
    return inchesToCm(clean);
  }

  return Math.round((Number(match[1]) * 12 + Number(match[2])) * 2.54);
}

function weightToClass(rawValue) {
  const pounds = Number(String(rawValue || "").match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
  if (!pounds) {
    return "Lightweight";
  }

  if (pounds <= 125.5) return "Flyweight";
  if (pounds <= 135.5) return "Bantamweight";
  if (pounds <= 145.5) return "Featherweight";
  if (pounds <= 155.5) return "Lightweight";
  if (pounds <= 170.5) return "Welterweight";
  if (pounds <= 185.5) return "Middleweight";
  if (pounds <= 205.5) return "Light Heavyweight";
  return "Heavyweight";
}

function extractCsrfToken(html) {
  return (html.match(/name="_token" value="([^"]+)"/i) || [])[1] || "";
}

function extractSeasonType(html) {
  return (html.match(/id="season_type"[^>]+value="([^"]*)"/i) || [])[1] || "";
}

function extractCookies(setCookieHeaders) {
  return (setCookieHeaders || []).map((value) => value.split(";")[0]).join("; ");
}

function postForm(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "User-Agent": "FightBaseBot/1.0",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        }
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            return;
          }

          resolve(payload);
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function parseRosterCards(html) {
  return [...html.matchAll(/<a class="fighter-link" href="(https:\/\/pflmma\.com\/[^"]+\/[^"]+)"[\s\S]*?<h5 class="mb-0">([\s\S]*?)<\/h5>[\s\S]*?<p class="mb-2 mt-2 fighter-hovertext">([^<]*)<\/p>[\s\S]*?<img class="fighter-img" src="([^"]+)"/gi)]
    .map((match) => {
      const url = match[1];
      const heading = match[2];
      const firstName = stripTags((heading.match(/^([^<]+)/) || [])[1] || "");
      const nickname = stripTags((heading.match(/<small class="d-block">([\s\S]*?)<\/small>/i) || [])[1] || "");
      const lastName = stripTags((heading.match(/<span class="d-block">([\s\S]*?)<\/span>/i) || [])[1] || "");
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

      return {
        url,
        sourceSlug: normalizeSourceSlug(decodeURIComponent(url.split("/").pop() || fullName)),
        name: fullName,
        nickname: nickname.replace(/^"|"$/g, "").trim() || null,
        record: stripTags(match[3]),
        photoUrl: match[4]
      };
    })
    .filter((card) => card.name && card.url);
}

async function fetchRosterState() {
  return new Promise((resolve, reject) => {
    https
      .get(
        ROSTER_URL,
        {
          headers: {
            "User-Agent": "FightBaseBot/1.0"
          }
        },
        (response) => {
          const chunks = [];
          const cookies = extractCookies(response.headers["set-cookie"]);

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on("end", () => {
            const html = Buffer.concat(chunks).toString("utf8");
            resolve({
              html,
              cookies,
              token: extractCsrfToken(html),
              seasonType: extractSeasonType(html)
            });
          });
        }
      )
      .on("error", reject);
  });
}

async function fetchAjaxRosterPage(page, token, cookies, seasonType) {
  const body = new URLSearchParams({
    _token: token,
    season_type: seasonType,
    season_year: "",
    weightclass: "",
    gender: "",
    query_s: "",
    page: String(page)
  }).toString();

  const response = await postForm("https://pflmma.com/ajax/query_fighters", body, {
    "X-CSRF-TOKEN": token,
    Cookie: cookies,
    "X-Requested-With": "XMLHttpRequest",
    Referer: ROSTER_URL
  });

  return JSON.parse(response);
}

async function collectPflRosterCards(maxPages = 80) {
  const state = await fetchRosterState();
  const cardsByUrl = new Map();

  for (const card of parseRosterCards(state.html)) {
    cardsByUrl.set(card.url, card);
  }

  for (let page = 2; page <= maxPages; page += 1) {
    const payload = await fetchAjaxRosterPage(page, state.token, state.cookies, state.seasonType);
    const cards = parseRosterCards(payload.html || "");

    if (cards.length === 0 || Number(payload.count || 0) === 0) {
      break;
    }

    for (const card of cards) {
      cardsByUrl.set(card.url, card);
    }
  }

  return [...cardsByUrl.values()];
}

function extractInfoMap(html) {
  const map = {};
  for (const match of html.matchAll(/<h4[^>]*>\s*([A-Z ]+?)\s*<span class="d-block">([\s\S]*?)<\/span>\s*<\/h4>/gi)) {
    map[titleCase(match[1])] = stripTags(match[2]);
  }

  for (const match of html.matchAll(/<div class="fighter-info-box[\s\S]*?<h3>([\s\S]*?)<\/h3>\s*<h4>([\s\S]*?)<\/h4>[\s\S]*?<\/div>/gi)) {
    map[titleCase(match[2])] = stripTags(match[1]);
  }

  return map;
}

function parseCareerNotes(html) {
  const notesBlock = (html.match(/<div class="col-12 career-notes">([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1] || "";
  const notes = [...notesBlock.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
  return notes.slice(0, 3);
}

function parsePflRecentFights(html, fighterName, defaultWeightClass) {
  const fightsWrapper = (html.match(/<div class="container-fluid px-0" id="fights-wrapper">([\s\S]*?)<div class="container-fluid px-0" id="videos-wrapper">/i) || [])[1] || "";
  const rows = [...fightsWrapper.matchAll(/<div class="row upcoming-fighter-row matchupRow[\s\S]*?<\/a>\s*<\/div>\s*<\/div>\s*<\/div>/gi)];

  return rows.slice(0, 8).map((match) => {
    const row = match[0];
    const headings = [...row.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>/gi)].map((item) => stripTags(item[1])).filter(Boolean);
    const names = [...row.matchAll(/<h4[^>]*class="mb-0[^"]*"[^>]*>([\s\S]*?)<\/h4>/gi)].map((item) => stripTags(item[1])).filter(Boolean);
    const dateLabel = stripTags((row.match(/<h3 class="mb-3">([\s\S]*?)<\/h3>/i) || [])[1] || "");
    const method = stripTags((row.match(/<span class="winBy">([\s\S]*?)<\/span>/i) || [])[1] || "");
    const roundTimeRaw = stripTags((row.match(/<span class="roundTime">([\s\S]*?)<\/span>/i) || [])[1] || "");
    const eventName = stripTags((row.match(/href="https:\/\/pflmma\.com\/event\/[^"]+"[^>]*>\s*<button[^>]*>\s*([\s\S]*?)<\/button>/i) || [])[1] || headings[0] || "PFL");
    const eventYear = Number((headings.join(" ").match(/\b(20\d{2})\b/) || [])[1] || new Date().getUTCFullYear());
    const resultRaw = /WINNER/i.test(row) ? "Победа" : /LOSER/i.test(row) ? "Поражение" : /DRAW/i.test(row) ? "Ничья" : /NO CONTEST/i.test(row) ? "Несостоявшийся бой" : "Бой в карьере";
    const weightClass = titleCase(String(headings[1] || defaultWeightClass).replace(/\s*\(\d+\)\s*$/, "")) || defaultWeightClass;
    const round = Number(roundTimeRaw.match(/R(?:d)?\s*(\d+)/i)?.[1] || 0) || null;
    const time = roundTimeRaw.match(/(\d:\d{2})/)?.[1] || null;
    const fighterSurname = fighterName.split(/\s+/).slice(-1)[0]?.toLowerCase();
    const opponentName = names.find((name) => !fighterSurname || !name.toLowerCase().includes(fighterSurname)) || names.find((name) => name !== fighterName) || "Соперник";

    return {
      opponentName,
      opponentNameRu: transliterateName(opponentName),
      eventName,
      result: resultRaw,
      method: method || null,
      date: parseTextDate(`${dateLabel} ${eventYear}`) || parseTextDate(dateLabel),
      round,
      time,
      weightClass,
      notes: null
    };
  }).filter((fight) => fight.date);
}

function parsePflProfile(html, card, existing) {
  const nickname = stripTags((html.match(/<h4 class="mt-2">([\s\S]*?)<\/h4>/i) || [])[1] || card.nickname || "");
  const name = card.name || stripTags((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const info = extractInfoMap(html);
  const careerRecord = stripTags((html.match(/Career Record:\s*([^<]+)/i) || [])[1] || card.record || existing?.record || "");
  const photoUrl = (html.match(/<img class="w-100 fighter-body[^"]*" src="([^"]+)"/i) || [])[1] || card.photoUrl || existing?.photoUrl || null;
  const country = normalizeCountry(info.From || existing?.country || "Unknown");
  const team = stripTags(info["Fight Camp"] || existing?.team || "PFL");
  const age = Number.parseInt(info.Age || "", 10) || existing?.age || 30;
  const heightCm = feetInchesToCm(info.Height) || existing?.heightCm || 180;
  const reachCm = inchesToCm(info["Arm Reach"]) || existing?.reachCm || heightCm;
  const weightClass = titleCase(weightToClass(info.Weight || "").replace(/\s+/g, " ")) || existing?.weightClass || "Lightweight";
  const notes = parseCareerNotes(html);
  const description = notes.length > 0 ? notes.join(". ") : "";
  const englishHighlights = notes.length > 0 ? `${notes.join(". ")}.` : null;

  return {
    slug: existing?.slug || card.sourceSlug || slugify(name),
    name,
    nameRu: getPreferredRussianName(name, existing?.nameRu),
    nickname: nickname.replace(/^"|"$/g, "").trim() || existing?.nickname || null,
    photoUrl,
    country,
    weightClass,
    status: existing?.status || "active",
    record: hasMeaningfulRecord(careerRecord) ? careerRecord : existing?.record || "",
    age,
    heightCm,
    reachCm,
    team,
    style: existing?.style || "MMA",
    bio:
      existing?.bio && existing.bio.length > 220
        ? existing.bio
        : buildGenericBio({
            nameRu: getPreferredRussianName(name, existing?.nameRu),
            promotionSlug: "pfl",
            country,
            weightClass,
            status: existing?.status || "active",
            nickname: nickname.replace(/^"|"$/g, "").trim() || existing?.nickname || null,
            record: hasMeaningfulRecord(careerRecord) ? careerRecord : existing?.record || "",
            team,
            highlights: notes.length > 0 ? notes.join(". ") + "." : null,
            description
          }),
    bioEn: buildGenericBioEn({
      name,
      promotionSlug: "pfl",
      country: info.From || existing?.country || "Unknown",
      weightClass,
      status: existing?.status || "active",
      nickname: nickname.replace(/^"|"$/g, "").trim() || existing?.nickname || null,
      record: hasMeaningfulRecord(careerRecord) ? careerRecord : existing?.record || "",
      team,
      highlights: englishHighlights,
      description
    }),
    recentFights: parsePflRecentFights(html, name, weightClass)
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;

  const promotion = await prisma.promotion.findUnique({
    where: { slug: "pfl" }
  });

  if (!promotion) {
    throw new Error("Promotion pfl not found");
  }

  const rosterCards = await collectPflRosterCards();
  const scopedCards = rosterCards.slice(offset, limit ? offset + limit : undefined);
  let created = 0;
  let updated = 0;
  let failed = 0;

  console.log(`Found ${rosterCards.length} PFL fighter cards. Processing ${scopedCards.length}.`);

  for (const card of scopedCards) {
    try {
      const sourceSlug = card.sourceSlug;
      const existing = (await prisma.fighter.findFirst({
        where: {
          OR: [
            { slug: sourceSlug },
            { name: card.name }
          ]
        },
        include: { recentFights: true }
      })) || null;

      const html = await fetchText(card.url);
      const profile = parsePflProfile(html, card, existing);

      const fighter = existing
        ? await prisma.fighter.update({
            where: { id: existing.id },
            data: {
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
            }
          })
        : await prisma.fighter.create({
            data: {
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
            }
          });

      await saveRecentFights(prisma, fighter.id, profile.recentFights);

      if (existing) {
        updated += 1;
        console.log(`Updated PFL fighter: ${fighter.name}`);
      } else {
        created += 1;
        console.log(`Created PFL fighter: ${fighter.name}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed PFL sync for ${card.url}: ${error.message || error}`);
    }
  }

  console.log(`PFL sync complete. Created: ${created}. Updated: ${updated}. Failed: ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
