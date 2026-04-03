#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { extractMetaContent, fetchJson, fetchText } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const wikiTitleOverrides = {
  "A.J. McKee": "AJ_McKee",
  "Patricio Pitbull": "Patricio_Freire",
  "Joshua Pacio": "Joshua_Pacio",
  "Adriano Moraes": "Adriano_Moraes",
  "Fabricio Andrade": "Fabricio_Andrade",
  "Sean O'Malley": "Sean_O%27Malley",
  "Corey Anderson": "Corey_Anderson",
  "Vadim Nemkov": "Vadim_Nemkov",
  "Sergio Pettis": "Sergio_Pettis",
  "Ryan Bader": "Ryan_Bader",
  "Gegard Mousasi": "Gegard_Mousasi",
  "Yaroslav Amosov": "Yaroslav_Amosov",
  "Raufeon Stots": "Raufeon_Stots",
  "Jason Jackson": "Jason_Jackson_(fighter)",
  "Brendan Loughnane": "Brendan_Loughnane",
  "Jesus Pinedo": "Jes%C3%BAs_Pinedo",
  "Sadibou Sy": "Sadibou_Sy",
  "Magomed Magomedkerimov": "Magomed_Magomedkerimov",
  "Liz Carmouche": "Liz_Carmouche",
  "Impa Kasanganay": "Impa_Kasanganay"
};

function normalizePhotoUrl(rawUrl) {
  const value = String(rawUrl || "").replace(/&amp;/g, "&").trim();
  if (!value || /no-profile-image/i.test(value)) {
    return null;
  }

  return value;
}

function parseUfcRosterPagePhotos(html) {
  const chunks = html.split('<div class="c-listing-athlete-flipcard__inner">').slice(1);
  const photosBySlug = new Map();

  for (const chunk of chunks) {
    const slug = (chunk.match(/href="\/athlete\/([^"?#/]+)"/i) || [])[1];
    if (!slug) {
      continue;
    }

    const images = [...chunk.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((match) => normalizePhotoUrl(match[1])).filter(Boolean);
    if (images[0]) {
      photosBySlug.set(slug, images[0]);
    }
  }

  return photosBySlug;
}

async function collectUfcRosterPhotos() {
  const photosBySlug = new Map();
  let page = 0;

  while (page < 200) {
    const html = await fetchText(`https://www.ufc.com/athletes/all?page=${page}`);
    const pagePhotos = parseUfcRosterPagePhotos(html);
    if (!pagePhotos.size) {
      break;
    }

    for (const [slug, photoUrl] of pagePhotos.entries()) {
      if (!photosBySlug.has(slug)) {
        photosBySlug.set(slug, photoUrl);
      }
    }

    if (!html.includes(`href="?page=${page + 1}"`)) {
      break;
    }

    page += 1;
  }

  return photosBySlug;
}

async function resolvePhotoByTitle(title) {
  try {
    const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    return summary.originalimage?.source || summary.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function resolvePhotoByWikipediaSearch(name) {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=" +
      encodeURIComponent(`${name} mixed martial artist`);
    const payload = await fetchJson(searchUrl);
    const candidates = payload?.query?.search || [];

    for (const candidate of candidates) {
      const photoUrl = await resolvePhotoByTitle(candidate.title);
      if (photoUrl) {
        return photoUrl;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function buildOfficialProfileUrl(fighter) {
  if (fighter.promotion?.slug === "ufc") {
    return `https://www.ufc.com/athlete/${fighter.slug}`;
  }

  return null;
}

async function resolvePhotoFromOfficialProfile(fighter) {
  const profileUrl = buildOfficialProfileUrl(fighter);
  if (!profileUrl) {
    return null;
  }

  try {
    const html = await fetchText(profileUrl);
    return (
      normalizePhotoUrl(extractMetaContent(html, "og:image")) ||
      normalizePhotoUrl((html.match(/hero-profile__image"[^>]+src="([^"]+)"/i) || [])[1]) ||
      normalizePhotoUrl((html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*image-style-teaser[^"]*"/i) || [])[1]) ||
      null
    );
  } catch {
    return null;
  }
}

async function main() {
  const ufcRosterPhotos = await collectUfcRosterPhotos();
  const fighters = await prisma.fighter.findMany({
    where: {
      OR: [{ photoUrl: null }, { photoUrl: "" }]
    },
    include: {
      promotion: true
    }
  });

  let updated = 0;

  for (const fighter of fighters) {
    const title = wikiTitleOverrides[fighter.name] || fighter.name.replace(/\s+/g, "_");
    const photoUrl =
      (fighter.promotion?.slug === "ufc" ? ufcRosterPhotos.get(fighter.slug) : null) ||
      (await resolvePhotoFromOfficialProfile(fighter)) ||
      (await resolvePhotoByTitle(title)) ||
      (await resolvePhotoByWikipediaSearch(fighter.name));

    if (!photoUrl) {
      continue;
    }

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: { photoUrl }
    });
    updated += 1;
  }

  console.log(`Filled missing photos for ${updated} fighters.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
