#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText } = require("./fighter-import-utils");
const { persistImageLocally } = require("./local-image-store");

const prisma = new PrismaClient();

function normalizePhotoUrl(rawUrl) {
  const value = String(rawUrl || "").replace(/&amp;/g, "&").trim();
  if (!value || /no-profile-image/i.test(value)) {
    return null;
  }

  return value;
}

function parseStatusFromHtml(html, existingStatus) {
  const tags = [...html.matchAll(/<p class="hero-profile__tag">\s*([\s\S]*?)\s*<\/p>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
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

  return existingStatus || "active";
}

function parsePhotoFromHtml(html) {
  return (
    normalizePhotoUrl((html.match(/property="og:image" content="([^"]+)"/i) || [])[1]) ||
    normalizePhotoUrl((html.match(/hero-profile__image"[^>]+src="([^"]+)"/i) || [])[1]) ||
    normalizePhotoUrl((html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*image-style-teaser[^"]*"/i) || [])[1]) ||
    null
  );
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: "ufc" },
      OR: [{ photoUrl: null }, { photoUrl: "" }]
    },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      photoUrl: true
    }
  });

  let updatedStatuses = 0;
  let updatedPhotos = 0;

  for (const fighter of fighters) {
    try {
      const html = await fetchText(`https://www.ufc.com/athlete/${fighter.slug}`);
      const nextStatus = parseStatusFromHtml(html, fighter.status);
      const nextPhotoUrl = fighter.photoUrl || parsePhotoFromHtml(html);
      const localizedPhotoUrl = nextPhotoUrl
        ? await persistImageLocally({
            bucket: "fighters",
            key: fighter.slug,
            sourceUrl: nextPhotoUrl
          }).catch(() => nextPhotoUrl)
        : null;
      const data = {};

      if (nextStatus !== fighter.status) {
        data.status = nextStatus;
      }

      if (!fighter.photoUrl && localizedPhotoUrl) {
        data.photoUrl = localizedPhotoUrl;
      }

      if (!Object.keys(data).length) {
        continue;
      }

      await prisma.fighter.update({
        where: { id: fighter.id },
        data
      });

      if (data.status) {
        updatedStatuses += 1;
      }

      if (data.photoUrl) {
        updatedPhotos += 1;
      }
    } catch (error) {
      console.error(`Failed UFC reconcile for ${fighter.slug}: ${error.message || error}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        checked: fighters.length,
        updatedStatuses,
        updatedPhotos
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
