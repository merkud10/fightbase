#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchJson, normalizeCountry, transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const fighters = [
  {
    slug: "corey-anderson",
    name: "Corey Anderson",
    nameRu: "Кори Андерсон",
    nickname: "Overtime",
    wikiTitle: "Corey_Anderson",
    country: "United States",
    weightClass: "Light Heavyweight",
    status: "active",
    record: "18-6",
    age: 36,
    heightCm: 191,
    reachCm: 201,
    team: "Kill Cliff FC",
    style: "Wrestling",
    bio: "Один из самых опытных полутяжеловесов в текущем пуле PFL с сильной борцовской базой и хорошим темпом на длинной дистанции.",
    promotionSlug: "pfl"
  },
  {
    slug: "vadim-nemkov",
    name: "Vadim Nemkov",
    nameRu: "Вадим Немков",
    nickname: null,
    wikiTitle: "Vadim_Nemkov",
    country: "Russia",
    weightClass: "Light Heavyweight",
    status: "champion",
    record: "18-2",
    age: 33,
    heightCm: 183,
    reachCm: 191,
    team: "Fedor Team",
    style: "Sambo / Striking",
    bio: "Топовый полутяжеловес с универсальной школой, опытом титульных боёв и хорошим контролем темпа в пятираундовых поединках.",
    promotionSlug: "pfl"
  },
  {
    slug: "sergio-pettis",
    name: "Sergio Pettis",
    nameRu: "Серхио Петтис",
    nickname: "The Phenom",
    wikiTitle: "Sergio_Pettis",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "24-7",
    age: 32,
    heightCm: 168,
    reachCm: 173,
    team: "Roufusport",
    style: "Kickboxing / MMA",
    bio: "Техничный легчайший вес с сильной школой ударки, таймингом и большим опытом титульных выступлений.",
    promotionSlug: "pfl"
  },
  {
    slug: "ryan-bader",
    name: "Ryan Bader",
    nameRu: "Райан Бейдер",
    nickname: "Darth",
    wikiTitle: "Ryan_Bader",
    country: "United States",
    weightClass: "Heavyweight",
    status: "active",
    record: "31-8",
    age: 42,
    heightCm: 188,
    reachCm: 188,
    team: "Power MMA Team",
    style: "Wrestling / Boxing",
    bio: "Ветеран элитного уровня с сильной базой в борьбе и большим опытом титульных боёв в полутяжёлом и тяжёлом весе.",
    promotionSlug: "pfl"
  },
  {
    slug: "gegard-mousasi",
    name: "Gegard Mousasi",
    nameRu: "Гегард Мусаси",
    nickname: "The Dreamcatcher",
    wikiTitle: "Gegard_Mousasi",
    country: "Netherlands",
    weightClass: "Middleweight",
    status: "active",
    record: "50-9-2",
    age: 40,
    heightCm: 188,
    reachCm: 193,
    team: "Mousasi Gym",
    style: "Kickboxing / Grappling",
    bio: "Один из самых титулованных бойцов за пределами UFC с огромным международным опытом и сильной универсальной школой.",
    promotionSlug: "pfl"
  },
  {
    slug: "yaroslav-amosov",
    name: "Yaroslav Amosov",
    nameRu: "Ярослав Амосов",
    nickname: "Dynamo",
    wikiTitle: "Yaroslav_Amosov",
    country: "Ukraine",
    weightClass: "Welterweight",
    status: "active",
    record: "28-1",
    age: 31,
    heightCm: 180,
    reachCm: 188,
    team: "MMA Pro Ukraine",
    style: "Sambo / Wrestling",
    bio: "Один из лучших полусредневесов вне UFC с очень надёжной борьбой и сильной структурой поединка.",
    promotionSlug: "pfl"
  },
  {
    slug: "raufeon-stots",
    name: "Raufeon Stots",
    nameRu: "Рауфеон Стотс",
    nickname: null,
    wikiTitle: "Raufeon_Stots",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "21-2",
    age: 36,
    heightCm: 170,
    reachCm: 183,
    team: "Syndicate MMA",
    style: "Wrestling / Boxing",
    bio: "Тактически грамотный легчайший вес с хорошим движением, плотной борьбой и умением забирать раунды.",
    promotionSlug: "pfl"
  },
  {
    slug: "jason-jackson",
    name: "Jason Jackson",
    nameRu: "Джейсон Джексон",
    nickname: "The Ass-Kicking Machine",
    wikiTitle: "Jason_Jackson_(fighter)",
    country: "Jamaica",
    weightClass: "Welterweight",
    status: "champion",
    record: "19-5",
    age: 34,
    heightCm: 185,
    reachCm: 198,
    team: "Kill Cliff FC",
    style: "Striking / Wrestling",
    bio: "Один из лидеров PFL в полусреднем весе с хорошей длиной, дисциплиной и силовой манерой.",
    promotionSlug: "pfl"
  },
  {
    slug: "brendan-loughnane",
    name: "Brendan Loughnane",
    nameRu: "Брендан Лафнейн",
    nickname: null,
    wikiTitle: "Brendan_Loughnane",
    country: "England",
    weightClass: "Featherweight",
    status: "champion",
    record: "29-6",
    age: 35,
    heightCm: 173,
    reachCm: 183,
    team: "Manchester Top Team",
    style: "Boxing / MMA",
    bio: "Сильный полулёгкий вес PFL с мощной ударной серийностью и большим опытом турнирных сеток.",
    promotionSlug: "pfl"
  },
  {
    slug: "jesus-pinedo",
    name: "Jesus Pinedo",
    nameRu: "Хесус Пинедо",
    nickname: "El Mudo",
    wikiTitle: "Jes%C3%BAs_Pinedo",
    country: "Peru",
    weightClass: "Featherweight",
    status: "active",
    record: "24-6-1",
    age: 29,
    heightCm: 180,
    reachCm: 183,
    team: "Peru Fight Academy",
    style: "Striking",
    bio: "Опасный финишёр полулёгкого веса с тяжёлым ударом и быстрым выходом на размен.",
    promotionSlug: "pfl"
  },
  {
    slug: "sadibou-sy",
    name: "Sadibou Sy",
    nameRu: "Садибу Си",
    nickname: "The Swedish Denzel Washington",
    wikiTitle: "Sadibou_Sy",
    country: "Sweden",
    weightClass: "Welterweight",
    status: "active",
    record: "17-8-2",
    age: 38,
    heightCm: 191,
    reachCm: 206,
    team: "Hard Knocks 365",
    style: "Kickboxing",
    bio: "Высокий полусредневес с хорошей дистанционной ударкой и большим опытом в турнирном формате PFL.",
    promotionSlug: "pfl"
  },
  {
    slug: "magomed-magomedkerimov",
    name: "Magomed Magomedkerimov",
    nameRu: "Магомед Магомедкеримов",
    nickname: null,
    wikiTitle: "Magomed_Magomedkerimov",
    country: "Russia",
    weightClass: "Welterweight",
    status: "active",
    record: "34-6",
    age: 35,
    heightCm: 183,
    reachCm: 188,
    team: "DagFighter",
    style: "Wrestling / Grappling",
    bio: "Один из самых успешных турнирных бойцов PFL с сильной борьбой, контролем и высоким уровнем зрелости в поединке.",
    promotionSlug: "pfl"
  },
  {
    slug: "liz-carmouche",
    name: "Liz Carmouche",
    nameRu: "Лиз Кармуш",
    nickname: "Girl-Rilla",
    wikiTitle: "Liz_Carmouche",
    country: "United States",
    weightClass: "Flyweight",
    status: "active",
    record: "23-8",
    age: 41,
    heightCm: 168,
    reachCm: 168,
    team: "Team Hurricane Awesome",
    style: "Wrestling",
    bio: "Одна из самых опытных бойцов женского ММА с сильной борьбой и большим числом титульных боёв.",
    promotionSlug: "pfl"
  },
  {
    slug: "impa-kasanganay",
    name: "Impa Kasanganay",
    nameRu: "Импа Касанганай",
    nickname: "Tshilobo",
    wikiTitle: "Impa_Kasanganay",
    country: "United States",
    weightClass: "Light Heavyweight",
    status: "active",
    record: "18-5",
    age: 31,
    heightCm: 180,
    reachCm: 191,
    team: "Fight Sports",
    style: "Striking / Wrestling",
    bio: "Физически сильный боец турнирного формата с хорошей ударкой и способностью держать высокий темп.",
    promotionSlug: "pfl"
  }
];

async function resolvePhotoUrl(fighter) {
  if (!fighter.wikiTitle) {
    return null;
  }

  try {
    const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fighter.wikiTitle)}`);
    return summary.originalimage?.source || summary.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function main() {
  const promotions = await prisma.promotion.findMany({
    select: { id: true, slug: true }
  });

  const promotionMap = Object.fromEntries(promotions.map((promotion) => [promotion.slug, promotion.id]));
  let created = 0;
  let updated = 0;

  for (const fighter of fighters) {
    const promotionId = promotionMap[fighter.promotionSlug];
    if (!promotionId) {
      throw new Error(`Promotion not found for slug: ${fighter.promotionSlug}`);
    }

    const existing = await prisma.fighter.findUnique({
      where: { slug: fighter.slug }
    });

    const photoUrl = (await resolvePhotoUrl(fighter)) || existing?.photoUrl || null;

    const payload = {
      slug: fighter.slug,
      name: fighter.name,
      nameRu: fighter.nameRu || transliterateName(fighter.name),
      nickname: fighter.nickname,
      photoUrl,
      country: normalizeCountry(fighter.country),
      weightClass: fighter.weightClass,
      status: fighter.status,
      record: fighter.record,
      age: fighter.age,
      heightCm: fighter.heightCm,
      reachCm: fighter.reachCm,
      team: fighter.team,
      style: fighter.style,
      bio: fighter.bio,
      promotionId
    };

    if (existing) {
      await prisma.fighter.update({
        where: { id: existing.id },
        data: payload
      });
      updated += 1;
    } else {
      await prisma.fighter.create({
        data: payload
      });
      created += 1;
    }
  }

  console.log(`Expanded PFL roster. Created: ${created}. Updated: ${updated}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
