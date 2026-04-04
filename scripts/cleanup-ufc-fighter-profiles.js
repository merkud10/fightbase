#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const ufcNameDictionary = require("../lib/ufc-name-dictionary.json");

const prisma = new PrismaClient();

function slugifyName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function applyDictionaryCorrections(value) {
  let next = String(value || "").trim();
  if (!next) {
    return "";
  }

  for (const [wrongValue, correctValue] of Object.entries(ufcNameDictionary.ruCorrections || {})) {
    if (next.includes(wrongValue)) {
      next = next.split(wrongValue).join(correctValue);
    }
  }

  return next;
}

function splitSentences(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanBio(fighter) {
  let bio = applyDictionaryCorrections(fighter.bio);
  bio = bio
    .replace(/\bКирил Гане\b/g, "Сирил Ган")
    .replace(/\bТом Аспинэлл\b/g, "Том Аспиналл");

  const sentences = splitSentences(bio).filter((sentence) => {
    if (/чемпион(?:ом)? UFC|действующ(?:ий|его) чемпион/i.test(sentence)) {
      return false;
    }
    return true;
  });

  return sentences.join(" ").trim();
}

function preferredRussianName(fighter) {
  return (
    ufcNameDictionary.fullNames?.[fighter.name] ||
    applyDictionaryCorrections(fighter.nameRu) ||
    fighter.nameRu
  );
}

function buildSlugPlan(fighters) {
  const reserved = new Set(fighters.map((fighter) => fighter.slug));
  const plan = new Map();

  for (const fighter of fighters) {
    const currentSlug = String(fighter.slug || "");
    const desiredBase = slugifyName(fighter.name);

    if (!desiredBase) {
      continue;
    }

    const looksBroken = /-\d+$/.test(currentSlug) || !currentSlug.startsWith(desiredBase);
    if (!looksBroken) {
      continue;
    }

    let candidate = desiredBase;
    let suffix = 2;
    while (reserved.has(candidate) && candidate !== currentSlug) {
      candidate = `${desiredBase}-${suffix}`;
      suffix += 1;
    }

    if (candidate !== currentSlug) {
      reserved.delete(currentSlug);
      reserved.add(candidate);
      plan.set(fighter.id, candidate);
    }
  }

  return plan;
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: { promotion: { slug: "ufc" } },
    select: {
      id: true,
      slug: true,
      name: true,
      nameRu: true,
      status: true,
      bio: true
    },
    orderBy: { slug: "asc" }
  });

  const slugPlan = buildSlugPlan(fighters);
  let updated = 0;

  for (const fighter of fighters) {
    const nextNameRu = preferredRussianName(fighter);
    const nextBio = cleanBio(fighter);
    const nextSlug = slugPlan.get(fighter.id) || fighter.slug;

    if (nextNameRu !== fighter.nameRu || nextBio !== fighter.bio || nextSlug !== fighter.slug) {
      await prisma.fighter.update({
        where: { id: fighter.id },
        data: {
          nameRu: nextNameRu,
          bio: nextBio,
          slug: nextSlug
        }
      });
      updated += 1;
    }
  }

  console.log(JSON.stringify({ checked: fighters.length, updated, slugUpdates: slugPlan.size }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
