#!/usr/bin/env node

const https = require("https");

const countryMap = {
  Armenia: "Армения",
  Australia: "Австралия",
  Austria: "Австрия",
  Belarus: "Беларусь",
  Brazil: "Бразилия",
  Bulgaria: "Болгария",
  Cameroon: "Камерун",
  Canada: "Канада",
  Chile: "Чили",
  China: "Китай",
  Colombia: "Колумбия",
  Cuba: "Куба",
  Czechia: "Чехия",
  CzechRepublic: "Чехия",
  Denmark: "Дания",
  Ecuador: "Эквадор",
  England: "Англия",
  France: "Франция",
  Georgia: "Грузия",
  Germany: "Германия",
  Ireland: "Ирландия",
  Israel: "Израиль",
  Italy: "Италия",
  Japan: "Япония",
  Kazakhstan: "Казахстан",
  Kyrgyzstan: "Кыргызстан",
  Mexico: "Мексика",
  Moldova: "Молдова",
  Netherlands: "Нидерланды",
  NewZealand: "Новая Зеландия",
  Nigeria: "Нигерия",
  Norway: "Норвегия",
  Peru: "Перу",
  Philippines: "Филиппины",
  Poland: "Польша",
  Romania: "Румыния",
  Russia: "Россия",
  Senegal: "Сенегал",
  Singapore: "Сингапур",
  SouthAfrica: "ЮАР",
  SouthKorea: "Южная Корея",
  Spain: "Испания",
  Sweden: "Швеция",
  Switzerland: "Швейцария",
  Taiwan: "Тайвань",
  Thailand: "Таиланд",
  Turkey: "Турция",
  Ukraine: "Украина",
  UnitedArabEmirates: "ОАЭ",
  UnitedKingdom: "Великобритания",
  UnitedStates: "США",
  Uzbekistan: "Узбекистан"
};

const weightClassMap = {
  Strawweight: "Минимальный вес",
  Flyweight: "Наилегчайший вес",
  Bantamweight: "Легчайший вес",
  Featherweight: "Полулегкий вес",
  Lightweight: "Легкий вес",
  Welterweight: "Полусредний вес",
  Middleweight: "Средний вес",
  "Light Heavyweight": "Полутяжелый вес",
  Heavyweight: "Тяжелый вес"
};

const promotionLabelMap = {
  ufc: "UFC",
  one: "ONE Championship",
  pfl: "PFL"
};

const monthMap = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function fetchText(url, redirectCount = 0) {
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
          const statusCode = response.statusCode ?? 500;

          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= 5) {
              reject(new Error(`Too many redirects for ${url}`));
              return;
            }

            const redirectedUrl = new URL(response.headers.location, url).toString();
            response.resume();
            fetchText(redirectedUrl, redirectCount + 1).then(resolve).catch(reject);
            return;
          }

          const chunks = [];

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on("end", () => {
            const payload = Buffer.concat(chunks).toString("utf8");
            if (statusCode >= 400) {
              reject(new Error(`HTTP ${statusCode} for ${url}`));
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
  return JSON.parse(await fetchText(url));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeCountry(value) {
  const clean = stripTags(value).replace(/\s+/g, "");
  return countryMap[clean] || stripTags(value);
}

function translateWeightClass(value) {
  return weightClassMap[titleCase(stripTags(value).replace(/\s+division$/i, ""))] || stripTags(value);
}

function promotionLabel(slug) {
  return promotionLabelMap[slug] || slug.toUpperCase();
}

function hasMeaningfulRecord(value) {
  const clean = stripTags(value);
  return Boolean(clean) && !/^0-0(?:-0)?$/.test(clean) && clean !== "-";
}

function hasMeaningfulTeam(value) {
  const clean = stripTags(value);
  return Boolean(clean) && !/^(unknown|one championship|ufc performance institute)$/i.test(clean);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function matchAllText(html, regex) {
  return [...html.matchAll(regex)].map((match) => match[1] || match[0]);
}

function extractMetaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  return stripTags((html.match(regex) || [])[1] || "");
}

function transliterateToken(token) {
  const special = {
    Jones: "Джонс",
    Johnson: "Джонсон",
    Topuria: "Топурия",
    Pereira: "Перейра",
    Makhachev: "Махачев",
    Nurmagomedov: "Нурмагомедов",
    Chimaev: "Чимаев",
    Tsarukyan: "Царукян",
    Ankalaev: "Анкалаев",
    Shevchenko: "Шевченко",
    Malykhin: "Малыхин",
    Pacio: "Пасио",
    Moraes: "Мораес",
    Andrade: "Андраде",
    Ngannou: "Нганну",
    Ditcheva: "Дитчева",
    Eblen: "Эблен",
    Mckee: "Макки",
    Omalley: "О'Мэлли",
    "O'Malley": "О'Мэлли",
    Dvalishvili: "Двалишвили",
    Aspinall: "Аспиналл",
    Plessis: "Плесси",
    Muhammad: "Мухаммад",
    Evloev: "Евлоев",
    Mix: "Микс",
    Pitbull: "Питбуль",
    Weili: "Вэйли",
    Belal: "Белал",
    Merab: "Мераб",
    Tom: "Том",
    Jon: "Джон",
    Sean: "Шон",
    Leon: "Леон",
    Francis: "Фрэнсис",
    Dakota: "Дакота",
    Larissa: "Ларисса",
    Christian: "Кристиан",
    Anatoly: "Анатолий",
    Joshua: "Джошуа",
    Valentina: "Валентина",
    Zhang: "Чжан",
    Magomed: "Магомед",
    Ilia: "Илия",
    Umar: "Умар",
    Usman: "Усман",
    Arman: "Арман",
    Khamzat: "Хамзат",
    Reinier: "Ренье",
    Fabricio: "Фабрисио",
    Adriano: "Адриано",
    Patricio: "Патрисио"
  };

  if (special[token]) {
    return special[token];
  }

  const map = {
    a: "а",
    b: "б",
    c: "к",
    d: "д",
    e: "е",
    f: "ф",
    g: "г",
    h: "х",
    i: "и",
    j: "дж",
    k: "к",
    l: "л",
    m: "м",
    n: "н",
    o: "о",
    p: "п",
    q: "к",
    r: "р",
    s: "с",
    t: "т",
    u: "у",
    v: "в",
    w: "у",
    x: "кс",
    y: "и",
    z: "з"
  };

  const normalized = token
    .replace(/ph/gi, "f")
    .replace(/sh/gi, "ш")
    .replace(/ch/gi, "ч")
    .replace(/zh/gi, "ж")
    .replace(/kh/gi, "х")
    .replace(/ya/gi, "я")
    .replace(/yu/gi, "ю")
    .replace(/yo/gi, "ё")
    .replace(/th/gi, "т");

  let output = "";

  for (const char of normalized.toLowerCase()) {
    if (/[а-яё]/i.test(char)) {
      output += char;
      continue;
    }

    output += map[char] || char;
  }

  return output.charAt(0).toUpperCase() + output.slice(1);
}

function transliterateName(name) {
  return stripTags(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => transliterateToken(token))
    .join(" ");
}

const preferredRussianNameMap = {
  "Maycee Barber": "Мэйси Барбер",
  "Reinier de Ridder": "Ренье де Риддер",
  "Manon Fiorot": "Манон Фиоро",
  "Kayla Harrison": "Кайла Харрисон",
  "Belal Muhammad": "Белал Мухаммад",
  "Merab Dvalishvili": "Мераб Двалишвили",
  "Ilia Topuria": "Илия Топурия",
  "Sean O'Malley": "Шон О'Мэлли",
  "Tom Aspinall": "Том Аспиналл",
  "Dricus Du Plessis": "Дрикус дю Плесси",
  "Zhang Weili": "Чжан Вэйли",
  "Valentina Shevchenko": "Валентина Шевченко",
  "Jon Jones": "Джон Джонс"
};

function getPreferredRussianName(name, existingNameRu) {
  const cleanName = stripTags(name);
  return preferredRussianNameMap[cleanName] || existingNameRu || transliterateName(cleanName);
}

function parseMetricNumber(rawValue) {
  const match = String(rawValue || "").match(/(\d+(?:\.\d+)?)\s*CM/i);
  if (!match) {
    return null;
  }

  return Math.round(Number(match[1]));
}

function parseLbsWeightToClass(rawValue) {
  const match = String(rawValue || "").match(/(\d+(?:\.\d+)?)\s*LBS/i);
  if (!match) {
    return null;
  }

  const pounds = Number(match[1]);

  if (pounds <= 125.5) return "Flyweight";
  if (pounds <= 135.5) return "Bantamweight";
  if (pounds <= 145.5) return "Featherweight";
  if (pounds <= 155.5) return "Lightweight";
  if (pounds <= 170.5) return "Welterweight";
  if (pounds <= 185.5) return "Middleweight";
  if (pounds <= 205.5) return "Light Heavyweight";
  return "Heavyweight";
}

function buildGenericBio({
  nameRu,
  promotionSlug,
  country,
  weightClass,
  status,
  nickname,
  record,
  team,
  highlights,
  description
}) {
  const countryRu = normalizeCountry(country);
  const weightRu = translateWeightClass(weightClass);
  const promotion = promotionLabel(promotionSlug);
  const parts = [`${nameRu} — профессиональный боец ${promotion}, представляющий ${countryRu} и выступающий в категории «${weightRu}».`];

  if (nickname) {
    parts.push(`Выступает под прозвищем «${nickname}».`);
  }

  const profileLine = [];
  if (hasMeaningfulRecord(record)) {
    profileLine.push(`рекорд ${record}`);
  }
  if (hasMeaningfulTeam(team)) {
    profileLine.push(`команда ${team}`);
  }
  if (profileLine.length > 0) {
    parts.push(`В официальном профиле указаны ${profileLine.join(", ")}.`);
  }

  if (highlights) {
    parts.push(highlights);
  } else if (description) {
    if (status === "champion") {
      parts.push("На текущий момент входит в число чемпионов своей организации.");
    } else if (status === "prospect") {
      parts.push("Считается одним из заметных проспектов своего дивизиона.");
    } else if (status === "retired") {
      parts.push("Сейчас значится вне активных выступлений.");
    }
  } else {
    if (status === "champion") {
      parts.push("На текущий момент входит в число чемпионов своей организации.");
    } else if (status === "prospect") {
      parts.push("Считается одним из заметных проспектов своего дивизиона.");
    } else if (status === "retired") {
      parts.push("Сейчас значится вне активных выступлений.");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildGenericBioEn({
  name,
  promotionSlug,
  country,
  weightClass,
  status,
  nickname,
  record,
  team,
  highlights,
  description
}) {
  const promotion = promotionLabel(promotionSlug);
  const weight = titleCase(stripTags(weightClass || "").replace(/\s+division$/i, "")) || "Lightweight";
  const countryEn = stripTags(country);
  const parts = [`${name} is a professional ${promotion} fighter competing at ${weight.toLowerCase()}.`];

  if (nickname) {
    parts.push(`Known by the nickname "${nickname}".`);
  }

  if (countryEn && !/^unknown$/i.test(countryEn)) {
    parts.push(`Represents ${countryEn}.`);
  }

  const profileLine = [];
  if (hasMeaningfulRecord(record)) {
    profileLine.push(`record ${record}`);
  }
  if (hasMeaningfulTeam(team)) {
    profileLine.push(`team ${team}`);
  }
  if (profileLine.length > 0) {
    parts.push(`Official profile details list ${profileLine.join(", ")}.`);
  }

  if (highlights) {
    parts.push(highlights);
  } else if (description) {
    if (status === "champion") {
      parts.push("Currently holds championship status in the promotion.");
    } else if (status === "prospect") {
      parts.push("Considered one of the notable prospects in the division.");
    } else if (status === "retired") {
      parts.push("Currently listed outside active competition.");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parseTextDate(value) {
  const clean = stripTags(value).replace(/,/g, "").trim();
  const match = clean.match(/([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (!match) {
    const parsed = new Date(clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const month = monthMap[match[1].slice(0, 3).toLowerCase()];
  if (month == null) {
    return null;
  }

  return new Date(Date.UTC(Number(match[3]), month, Number(match[2]), 12, 0, 0));
}

function parseUnixDate(timestamp) {
  const numeric = Number(timestamp);
  if (!numeric) {
    return null;
  }

  return new Date(numeric * 1000);
}

async function saveRecentFights(prisma, fighterId, fights) {
  await prisma.fighterRecentFight.deleteMany({
    where: { fighterId }
  });

  for (const fight of fights) {
    if (!fight.date) {
      continue;
    }

    await prisma.fighterRecentFight.create({
      data: {
        fighterId,
        opponentName: fight.opponentName,
        opponentNameRu: fight.opponentNameRu || transliterateName(fight.opponentName),
        eventName: fight.eventName,
        result: fight.result,
        method: fight.method || null,
        date: fight.date,
        round: fight.round || null,
        time: fight.time || null,
        weightClass: fight.weightClass || null,
        notes: fight.notes || null
      }
    });
  }
}

module.exports = {
  buildGenericBio,
  buildGenericBioEn,
  decodeHtmlEntities,
  extractMetaContent,
  fetchJson,
  fetchText,
  hasMeaningfulRecord,
  hasMeaningfulTeam,
  matchAllText,
  normalizeCountry,
  parseArgs,
  parseMetricNumber,
  parseLbsWeightToClass,
  parseTextDate,
  parseUnixDate,
  promotionLabel,
  saveRecentFights,
  slugify,
  stripTags,
  titleCase,
  translateWeightClass,
  getPreferredRussianName,
  transliterateName
};
