#!/usr/bin/env node

const https = require("https");

const { PrismaClient } = require("@prisma/client");
const { persistImageLocally } = require("./local-image-store");

const prisma = new PrismaClient();

const fighters = [
  {
    slug: "alex-pereira",
    name: "Alex Pereira",
    nameRu: "Алекс Перейра",
    nickname: "Poatan",
    officialPhotoUrl: "https://ufc.com/images/2025-03/PEREIRA_ALEX_BELT_03-08.png",
    wikiTitle: "Alex_Pereira",
    country: "Brazil",
    weightClass: "Light Heavyweight",
    status: "active",
    record: "13-3",
    age: 38,
    heightCm: 193,
    reachCm: 201,
    team: "Teixeira MMA",
    style: "Kickboxing",
    bio: "Ударник элитного уровня с редкой мощью и умением завершать бой одним точным попаданием.",
    promotionSlug: "ufc"
  },
  {
    slug: "islam-makhachev",
    name: "Islam Makhachev",
    nameRu: "Ислам Махачев",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-01/7/MAKHACHEV_ISLAM_BELT_01-18.png",
    wikiTitle: "Islam_Makhachev",
    country: "Russia",
    weightClass: "Lightweight",
    status: "champion",
    record: "28-1",
    age: 34,
    heightCm: 178,
    reachCm: 179,
    team: "American Kickboxing Academy",
    style: "Sambo",
    bio: "Чемпион с элитным контролем в борьбе и зрелой ударной игрой на дистанции.",
    promotionSlug: "ufc"
  },
  {
    slug: "shavkat-rakhmonov",
    name: "Shavkat Rakhmonov",
    nameRu: "Шавкат Рахмонов",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-01/5/RAKHMONOV_SHAVKAT_12-07.png",
    wikiTitle: "Shavkat_Rakhmonov",
    country: "Kazakhstan",
    weightClass: "Welterweight",
    status: "active",
    record: "19-0",
    age: 31,
    heightCm: 185,
    reachCm: 196,
    team: "Dar Team",
    style: "Well-rounded",
    bio: "Непобежденный полусредневес с универсальным арсеналом и ярко выраженным инстинктом финишера.",
    promotionSlug: "ufc"
  },
  {
    slug: "ilia-topuria",
    name: "Ilia Topuria",
    nameRu: "Илия Топурия",
    nickname: "El Matador",
    officialPhotoUrl: "https://ufc.com/images/2025-06/TOPURIA_ILIA_BELT_10-26.png",
    wikiTitle: "Ilia_Topuria",
    country: "Spain",
    weightClass: "Lightweight",
    status: "champion",
    record: "17-0",
    age: 29,
    heightCm: 170,
    reachCm: 175,
    team: "Climent Club",
    style: "Boxing / Grappling",
    bio: "Один из самых опасных ударников нового поколения UFC с качественной борьбой в переходных фазах.",
    promotionSlug: "ufc"
  },
  {
    slug: "merab-dvalishvili",
    name: "Merab Dvalishvili",
    nameRu: "Мераб Двалишвили",
    nickname: "The Machine",
    officialPhotoUrl: "https://ufc.com/images/2024-09/DVALISHVILI_MERAB_CG_09-14.png",
    wikiTitle: "Merab_Dvalishvili",
    country: "Georgia",
    weightClass: "Bantamweight",
    status: "champion",
    record: "20-4",
    age: 35,
    heightCm: 168,
    reachCm: 173,
    team: "Serra-Longo Fight Team",
    style: "Pressure Wrestling",
    bio: "Темповик мирового уровня, который выигрывает за счет постоянного давления, борьбы и объема работы.",
    promotionSlug: "ufc"
  },
  {
    slug: "tom-aspinall",
    name: "Tom Aspinall",
    nameRu: "Том Аспиналл",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-10/ASPINALL_TOM_BELT_10-25.png",
    wikiTitle: "Tom_Aspinall",
    country: "England",
    weightClass: "Heavyweight",
    status: "champion",
    record: "15-3",
    age: 33,
    heightCm: 196,
    reachCm: 198,
    team: "Team Kaobon",
    style: "Boxing / Jiu-Jitsu",
    bio: "Очень быстрый тяжеловес с редким для дивизиона сочетанием мобильности, бокса и сабмишен-угрозы.",
    promotionSlug: "ufc"
  },
  {
    slug: "dricus-du-plessis",
    name: "Dricus Du Plessis",
    nameRu: "Дрикус дю Плесси",
    nickname: "Stillknocks",
    officialPhotoUrl: "https://ufc.com/images/2024-01/DU_PLESSIS_DRICUS_01-20.png",
    wikiTitle: "Dricus_du_Plessis",
    country: "South Africa",
    weightClass: "Middleweight",
    status: "active",
    record: "23-3",
    age: 32,
    heightCm: 185,
    reachCm: 193,
    team: "CIT Performance Institute",
    style: "Pressure Striking",
    bio: "Неудобный и очень физически сильный средневес, который ломает структуру боя постоянным давлением.",
    promotionSlug: "ufc"
  },
  {
    slug: "belal-muhammad",
    name: "Belal Muhammad",
    nameRu: "Белал Мухаммад",
    nickname: "Remember the Name",
    officialPhotoUrl: "https://ufc.com/images/2025-11/MUHAMMAD_BELAL_11-22.png",
    wikiTitle: "Belal_Muhammad",
    country: "United States",
    weightClass: "Welterweight",
    status: "active",
    record: "24-4",
    age: 37,
    heightCm: 180,
    reachCm: 184,
    team: "Valentino Boxing",
    style: "Pressure Boxing / Wrestling",
    bio: "Системный полусредневес, который выигрывает за счет дисциплины, темпа и раундовой стабильности.",
    promotionSlug: "ufc"
  },
  {
    slug: "movsar-evloev",
    name: "Movsar Evloev",
    nameRu: "Мовсар Евлоев",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2026-03/EVLOEV_MOVSAR_03-21.png",
    wikiTitle: "Movsar_Evloev",
    country: "Russia",
    weightClass: "Featherweight",
    status: "active",
    record: "20-0",
    age: 31,
    heightCm: 173,
    reachCm: 183,
    team: "American Top Team",
    style: "Wrestling",
    bio: "Один из самых неудобных полулегковесов UFC с сильной борьбой и высоким бойцовским IQ.",
    promotionSlug: "ufc"
  },
  {
    slug: "jon-jones",
    name: "Jon Jones",
    nameRu: "Джон Джонс",
    nickname: "Bones",
    wikiTitle: "Jon_Jones",
    country: "United States",
    weightClass: "Heavyweight",
    status: "active",
    record: "28-1",
    age: 38,
    heightCm: 193,
    reachCm: 215,
    team: "Jackson Wink MMA",
    style: "MMA / Wrestling",
    bio: "Один из самых титулованных бойцов в истории UFC с выдающимся бойцовским интеллектом и адаптацией по ходу поединка.",
    promotionSlug: "ufc"
  },
  {
    slug: "umar-nurmagomedov",
    name: "Umar Nurmagomedov",
    nameRu: "Умар Нурмагомедов",
    nickname: null,
    wikiTitle: "Umar_Nurmagomedov",
    country: "Russia",
    weightClass: "Bantamweight",
    status: "active",
    record: "18-1",
    age: 30,
    heightCm: 173,
    reachCm: 175,
    team: "Nurmagomedov School",
    style: "Sambo / Kickboxing",
    bio: "Техничный легчайший вес с очень чистой дистанционной работой и сильной базой в борьбе.",
    promotionSlug: "ufc"
  },
  {
    slug: "sean-omalley",
    name: "Sean O'Malley",
    nameRu: "Шон О'Мэлли",
    nickname: "Sugar",
    wikiTitle: "Sean_O%27Malley",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "18-3",
    age: 31,
    heightCm: 180,
    reachCm: 183,
    team: "MMA Lab",
    style: "Striking",
    bio: "Один из самых медийных бойцов UFC, опасный за счет тайминга, футворка и нокаутирующей точности.",
    promotionSlug: "ufc"
  },
  {
    slug: "khamzat-chimaev",
    name: "Khamzat Chimaev",
    nameRu: "Хамзат Чимаев",
    nickname: "Borz",
    wikiTitle: "Khamzat_Chimaev",
    country: "United Arab Emirates",
    weightClass: "Middleweight",
    status: "active",
    record: "15-0",
    age: 31,
    heightCm: 188,
    reachCm: 191,
    team: "Allstars Training Center",
    style: "Wrestling / Pressure",
    bio: "Мощный универсал, который опасен и в борьбе, и в стойке, особенно когда быстро забирает инициативу.",
    promotionSlug: "ufc"
  },
  {
    slug: "leon-edwards",
    name: "Leon Edwards",
    nameRu: "Леон Эдвардс",
    nickname: "Rocky",
    wikiTitle: "Leon_Edwards",
    country: "England",
    weightClass: "Welterweight",
    status: "active",
    record: "22-5",
    age: 34,
    heightCm: 188,
    reachCm: 188,
    team: "Team Renegade",
    style: "Striking / Clinch",
    bio: "Элитный полусредневес с очень чистой ударной школой, отличным клинчем и хорошим контролем дистанции.",
    promotionSlug: "ufc"
  },
  {
    slug: "arman-tsarukyan",
    name: "Arman Tsarukyan",
    nameRu: "Арман Царукян",
    nickname: "Ahalkalakets",
    wikiTitle: "Arman_Tsarukyan",
    country: "Armenia",
    weightClass: "Lightweight",
    status: "active",
    record: "22-3",
    age: 29,
    heightCm: 170,
    reachCm: 184,
    team: "American Top Team",
    style: "Wrestling / Boxing",
    bio: "Быстрый и взрывной легковес с сильной борьбой и заметным прогрессом в стойке.",
    promotionSlug: "ufc"
  },
  {
    slug: "magomed-ankalaev",
    name: "Magomed Ankalaev",
    nameRu: "Магомед Анкалаев",
    nickname: null,
    wikiTitle: "Magomed_Ankalaev",
    country: "Russia",
    weightClass: "Light Heavyweight",
    status: "champion",
    record: "21-1-1",
    age: 34,
    heightCm: 190,
    reachCm: 191,
    team: "Gorets Fight Club",
    style: "Kickboxing / Sambo",
    bio: "Полутяжеловес с очень собранной ударной базой и сильной защитой от риска в длинных боях.",
    promotionSlug: "ufc"
  },
  {
    slug: "zhang-weili",
    name: "Zhang Weili",
    nameRu: "Чжан Вэйли",
    nickname: "Magnum",
    wikiTitle: "Zhang_Weili",
    country: "China",
    weightClass: "Strawweight",
    status: "champion",
    record: "26-3",
    age: 36,
    heightCm: 163,
    reachCm: 160,
    team: "Black Tiger Fight Club",
    style: "Sanda / Wrestling",
    bio: "Одна из главных звезд женского MMA с плотной ударкой, физической мощью и хорошими переходами в борьбу.",
    promotionSlug: "ufc"
  },
  {
    slug: "valentina-shevchenko",
    name: "Valentina Shevchenko",
    nameRu: "Валентина Шевченко",
    nickname: "Bullet",
    wikiTitle: "Valentina_Shevchenko",
    country: "Kyrgyzstan",
    weightClass: "Flyweight",
    status: "champion",
    record: "25-4-1",
    age: 38,
    heightCm: 165,
    reachCm: 169,
    team: "Tiger Muay Thai",
    style: "Muay Thai / MMA",
    bio: "Одна из самых техничных чемпионок в истории UFC с выдающейся ударной школой и большим опытом титульных боев.",
    promotionSlug: "ufc"
  },
  {
    slug: "manon-fiorot",
    name: "Manon Fiorot",
    nameRu: "Манон Фиоро",
    nickname: "The Beast",
    wikiTitle: "Manon_Fiorot",
    country: "France",
    weightClass: "Flyweight",
    status: "active",
    record: "12-2",
    age: 35,
    heightCm: 170,
    reachCm: 168,
    team: "Boxing Squad",
    style: "Karate / Kickboxing",
    bio: "Техничная ударница, которая держит темп и любит разрушать ритм соперницы через движение и прямые атаки.",
    promotionSlug: "ufc"
  },
  {
    slug: "kayla-harrison",
    name: "Kayla Harrison",
    nameRu: "Кайла Харрисон",
    nickname: null,
    wikiTitle: "Kayla_Harrison",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "19-1",
    age: 35,
    heightCm: 173,
    reachCm: 168,
    team: "American Top Team",
    style: "Judo / Wrestling",
    bio: "Олимпийская чемпионка по дзюдо, переведшая свою силовую базу и контроль в титульную гонку MMA.",
    promotionSlug: "ufc"
  },
];

const seededFighters = fighters.filter((fighter) => fighter.promotionSlug === "ufc");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "FightBaseBot/1.0"
          }
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          response.on("end", () => {
            const payload = Buffer.concat(chunks).toString("utf8");
            if ((response.statusCode ?? 500) >= 400) {
              reject(new Error(`HTTP ${response.statusCode} for ${url}`));
              return;
            }
            resolve(payload);
          });
        }
      )
      .on("error", reject);
  });
}

async function fetchJson(url) {
  const payload = await fetchText(url);
  return JSON.parse(payload);
}

async function resolvePhotoUrl(fighter) {
  if (fighter.officialPhotoUrl) {
    return fighter.officialPhotoUrl;
  }

  if (!fighter.wikiTitle) {
    return fighter.photoUrl ?? null;
  }

  const wikiLang = fighter.wikiLang || "en";
  const summaryUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fighter.wikiTitle)}`;

  try {
    const summary = await fetchJson(summaryUrl);
    return summary.originalimage?.source || summary.thumbnail?.source || fighter.photoUrl || null;
  } catch {
    return fighter.photoUrl || null;
  }
}

async function main() {
  const promotions = await prisma.promotion.findMany({
    select: { id: true, slug: true }
  });

  const promotionMap = Object.fromEntries(promotions.map((promotion) => [promotion.slug, promotion.id]));

  let created = 0;
  let updated = 0;

  for (const fighter of seededFighters) {
    const promotionId = promotionMap[fighter.promotionSlug];
    if (!promotionId) {
      throw new Error(`Promotion not found for slug: ${fighter.promotionSlug}`);
    }

    const photoUrl = await persistImageLocally({
      bucket: "fighters",
      key: fighter.slug,
      sourceUrl: await resolvePhotoUrl(fighter)
    }).catch(() => fighter.photoUrl || null);

    const payload = {
      slug: fighter.slug,
      name: fighter.name,
      nameRu: fighter.nameRu,
      nickname: fighter.nickname,
      photoUrl,
      country: fighter.country,
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

    const existing = await prisma.fighter.findUnique({
      where: { slug: fighter.slug },
      select: { id: true }
    });

    if (existing) {
      await prisma.fighter.update({
        where: { id: existing.id },
        data: payload
      });
      updated += 1;
      console.log(`Updated fighter: ${fighter.name}`);
    } else {
      await prisma.fighter.create({
        data: payload
      });
      created += 1;
      console.log(`Created fighter: ${fighter.name}`);
    }
  }

  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
