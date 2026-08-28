#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { buildGenericBio, hasMeaningfulRecord, normalizeCountry, transliterateName, translateWeightClass } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function pluralizeRu(value, one, few, many) {
  const abs = Math.abs(Number(value) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Правила ниже считают «требующим переписывания» почти любое живое био: латиница
// внутри прозвища («Kid Dynamite»), текст не с самого nameRu, упоминание команды.
// Замена же собирается шаблоном buildGenericBio и всегда беднее исходника —
// на проде под эти правила подпадало больше тысячи профилей, включая написанные
// вручную. Поэтому по умолчанию переписываем только пустые био, а стилевую
// чистку включаем явным флагом.
//
// Фактические расхождения (устаревший рекорд, сменившийся дивизион) чинит
// scripts/repair-fighter-bio-facts.js — точечно, сохраняя текст.
function needsRewrite(bio, fighter, { stylistic = false } = {}) {
  const text = String(bio || "").trim();
  const lower = text.toLowerCase();

  if (!text) return true;
  if (!stylistic) return false;

  if (text.length < 140) return true;
  if (/women'?s/i.test(text)) return true;
  if (/[A-Za-z]{4,}.*[A-Za-z]{4,}/.test(text)) return true;
  if (/представляющ(?:ий|ая)\s+[А-ЯЁ][а-яё]+/.test(text)) return true;
  if (/В профиле бойца указана страна: [A-Za-z]/.test(text)) return true;
  if (/и команда\s+/i.test(text)) return true;
  if (fighter.nameRu && !text.startsWith(fighter.nameRu)) return true;
  if (lower.includes("bellator record") || lower.includes("notable wins") || lower.includes("ncaa")) return true;

  return false;
}

function buildStatsSentence(fighter) {
  const parts = [];
  if (fighter.winsByKnockout) {
    parts.push(`${fighter.winsByKnockout} ${pluralizeRu(fighter.winsByKnockout, "победа", "победы", "побед")} нокаутом`);
  }
  if (fighter.winsBySubmission) {
    parts.push(`${fighter.winsBySubmission} ${pluralizeRu(fighter.winsBySubmission, "победа", "победы", "побед")} сабмишеном`);
  }
  if (fighter.winsByDecision) {
    parts.push(`${fighter.winsByDecision} ${pluralizeRu(fighter.winsByDecision, "победа", "победы", "побед")} решением`);
  }

  if (!parts.length) {
    return null;
  }

  return `В статистике бойца отмечены ${parts.join(", ")}.`;
}

function rewriteBio(fighter) {
  const country = normalizeCountry(fighter.country);
  const nameRu = fighter.nameRu || transliterateName(fighter.name);
  const generated = buildGenericBio({
    nameRu,
    promotionSlug: fighter.promotion?.slug || "mma",
    country,
    weightClass: translateWeightClass(fighter.weightClass),
    status: fighter.status,
    nickname: fighter.nickname,
    record: hasMeaningfulRecord(fighter.record) ? fighter.record : "",
    team: fighter.team,
    highlights: null,
    description: null
  });

  const statsSentence = fighter.promotion?.slug === "ufc" ? buildStatsSentence(fighter) : null;
  return [generated, statsSentence].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    include: {
      promotion: true
    }
  });

  const stylistic = process.argv.includes("--stylistic");
  const dryRun = process.argv.includes("--dry-run");
  let updated = 0;

  for (const fighter of fighters) {
    if (!needsRewrite(fighter.bio, fighter, { stylistic })) {
      continue;
    }

    const nextBio = rewriteBio(fighter);

    if (dryRun) {
      updated += 1;
      continue;
    }

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        bio: nextBio,
        country: normalizeCountry(fighter.country),
        nameRu: fighter.nameRu || transliterateName(fighter.name)
      }
    });
    updated += 1;
  }

  const mode = `${dryRun ? "dry-run, " : ""}${stylistic ? "стилевая чистка" : "только пустые био"}`;
  console.log(`Refreshed Russian fighter bio quality (${mode}): ${updated}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
