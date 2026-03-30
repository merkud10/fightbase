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
  "Women's Strawweight": "Минимальный вес",
  Flyweight: "Наилегчайший вес",
  "Women's Flyweight": "Наилегчайший вес",
  Bantamweight: "Легчайший вес",
  "Women's Bantamweight": "Легчайший вес",
  Featherweight: "Полулегкий вес",
  "Women's Featherweight": "Полулегкий вес",
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

const transliterationTokenMap = {
  AJ: "Эй Джей",
  McKee: "Макки",
  Mckee: "Макки",
  Omalley: "О'Мэлли",
  "O'Malley": "О'Мэлли",
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
  Patricio: "Патрисио",
  Demetrious: "Деметриус",
  Justin: "Джастин",
  Johnny: "Джонни",
  Joe: "Джо",
  Lewis: "Льюис",
  Mitch: "Митч",
  Nick: "Ник",
  Patrick: "Патрик",
  Tyson: "Тайсон",
  Youcef: "Юсеф",
  Younes: "Юнес",
  Youssef: "Юссеф",
  Sean: "Шон",
  Taylor: "Тейлор",
  Natan: "Натан",
  Schulte: "Шулте",
  Ciaran: "Киаран",
  Clarke: "Кларк",
  Abdoulaye: "Абдулай",
  Abdoul: "Абдул",
  Abdouraguimov: "Абдурагимов",
  Pedro: "Педру",
  Lee: "Ли"
};

const transliterationNameMap = {
  "Ariane Lipski da Silva": "Ариане Липски да Силва",
  "AJ McKee": "Эй Джей Макки",
  "Asael Adjoudj": "Асаэль Аджудж",
  "Asaël Adjoudj": "Асаэль Аджудж",
  "Anatoly Malykhin": "Анатолий Малыхин",
  "Asset Anarbayev": "Асет Анарбаев",
  "Cedric Doumbe": "Седрик Думбе",
  "Cédric Doumbé": "Седрик Думбе",
  "Chequina Noso Pedro": "Чекина Носу Педру",
  "Christian Lee": "Кристиан Ли",
  "Ciara McGuirk": "Киара Макгирк",
  "Ciaran Clarke": "Киаран Кларк",
  "Da Woon Jung": "Да Ун Джунг",
  "Demetrious Johnson": "Деметриус Джонсон",
  "Fabricio Andrade": "Фабрисио Андраде",
  "Francis Ngannou": "Фрэнсис Нганну",
  "Joshua Pacio": "Джошуа Пасио",
  "Johnny Eblen": "Джонни Эблен",
  "Justin Clarke": "Джастин Кларк",
  "Justin Jones Matoto": "Джастин Джонс Матото",
  "Lewis McGrillen": "Льюис Макгриллен",
  "Mele dje Yedoh": "Меледж Йедо",
  "Meledje Yedoh": "Меледж Йедо",
  "Mélèdje Yedoh": "Меледж Йедо",
  "Mitch McKee": "Митч Макки",
  "Natan Schulte": "Натан Шулте",
  "Patchy Mix": "Пэтчи Микс",
  "Patricio Pitbull": "Патрисио Питбуль",
  "Rhys McKee": "Рис Макки",
  "Sean Gauci": "Шон Гаучи",
  "Sergey Bilostenniy": "Сергей Белостенный",
  "Shadrack Yemba": "Шадрак Йемба",
  "Taylor Lapilus": "Тейлор Лапилус",
  "Tomasz Langowski": "Томаш Ланговский",
  "Tomasz Łangowski": "Томаш Ланговский",
  "Tyson Pedro": "Тайсон Педро",
  "Youcef Ouabbas": "Юсеф Уаббас",
  "Younes Najid": "Юнес Наджид",
  "Youssef Al Housani": "Юссеф Аль-Хусани",
  "Yabna N'tchala": "Ябна Нтчала",
  "Yabna N’tchala": "Ябна Нтчала",
  "Abdoul Abdouraguimov": "Абдул Абдурагимов",
  "Abdoulaye Kane": "Абдулай Кане"
};

function normalizeLatinToken(token) {
  return String(token || "")
    .replace(/[’']/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/gi, "l")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .replace(/ß/g, "ss");
}

function transliterateToken(token) {
  const original = stripTags(token);
  const cleanToken = normalizeLatinToken(original);

  if (["Da", "da", "De", "de"].includes(original)) {
    return original;
  }

  if (transliterationTokenMap[original]) {
    return transliterationTokenMap[original];
  }

  if (transliterationTokenMap[cleanToken]) {
    return transliterationTokenMap[cleanToken];
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

  const normalized = cleanToken
    .replace(/sch/gi, "ш")
    .replace(/shch/gi, "щ")
    .replace(/tch/gi, "ч")
    .replace(/sh/gi, "ш")
    .replace(/ch/gi, "ч")
    .replace(/zh/gi, "ж")
    .replace(/kh/gi, "х")
    .replace(/ph/gi, "ф")
    .replace(/ts/gi, "ц")
    .replace(/tz/gi, "ц")
    .replace(/ya/gi, "я")
    .replace(/yu/gi, "ю")
    .replace(/yo/gi, "ё")
    .replace(/ye/gi, "е")
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
  const cleanName = stripTags(name).replace(/\s+/g, " ").trim();
  const normalizedName = normalizeLatinToken(cleanName);

  if (transliterationNameMap[cleanName]) {
    return transliterationNameMap[cleanName];
  }

  if (transliterationNameMap[normalizedName]) {
    return transliterationNameMap[normalizedName];
  }

  return cleanName
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
  const cleanDescription = stripTags(description)
    .replace(/Get the latest [^.]+(?:\.|$)/gi, "")
    .replace(/\bNOTABLE WINS:[^.]+(?:\.|$)/gi, "")
    .replace(/\b\d+X NCAA[^.]+(?:\.|$)/gi, "")
    .replace(/\b\d+-\d+\s+BELLATOR RECORD[^.]+(?:\.|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedHighlights = stripTags(highlights).replace(/\s+/g, " ").trim();
  const parts = [`${nameRu} — профессиональный боец ${promotion}, выступающий в категории «${weightRu}».`];

  if (countryRu && !/^unknown$/i.test(countryRu)) {
    if (/,/.test(countryRu) || /[A-Za-z]{3,}/.test(countryRu)) {
      parts.push(`В официальном профиле указано место базовой подготовки: ${countryRu}.`);
    } else {
      parts.push(`В профиле бойца указана страна: ${countryRu}.`);
    }
  }

  if (nickname) {
    parts.push(`Выступает под прозвищем «${nickname}».`);
  }

  const profileLine = [];
  if (hasMeaningfulRecord(record)) {
    profileLine.push(`рекорд ${record}`);
  }
  if (hasMeaningfulTeam(team)) {
    profileLine.push(`команду ${team}`);
  }
  if (profileLine.length > 0) {
    parts.push(`Официальный профиль указывает ${profileLine.join(" и ")}.`);
  }

  if (normalizedHighlights && !/[A-Za-z]{4,}/.test(normalizedHighlights)) {
    parts.push(normalizedHighlights);
  } else if (cleanDescription && !/[A-Za-z]{4,}/.test(cleanDescription)) {
    parts.push(cleanDescription);
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
  const cleanDescription = stripTags(description)
    .replace(/Get the latest [^.]+(?:\.|$)/gi, "")
    .replace(/Official profile details list [^.]+(?:\.|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedHighlights = stripTags(highlights).replace(/\s+/g, " ").trim();
  const parts = [`${name} is a professional ${promotion} fighter competing at ${weight.toLowerCase()}.`];

  if (nickname) {
    parts.push(`Known by the nickname "${nickname}".`);
  }

  if (countryEn && !/^unknown$/i.test(countryEn)) {
    if (/,/.test(countryEn)) {
      parts.push(`Fights out of ${countryEn}.`);
    } else if (!/[А-Яа-яЁё]/.test(countryEn)) {
      parts.push(`Represents ${countryEn}.`);
    }
  }

  const profileLine = [];
  if (hasMeaningfulRecord(record)) {
    const article = /^[8]|^11|^18/i.test(String(record || "").trim()) ? "an" : "a";
    profileLine.push(`${article} ${record} professional record`);
  }
  if (hasMeaningfulTeam(team)) {
    profileLine.push(`${team} as the listed camp`);
  }

  if (cleanDescription) {
    parts.push(cleanDescription);
  }

  if (normalizedHighlights) {
    parts.push(normalizedHighlights);
  }

  if (profileLine.length > 0) {
    parts.push(`The official profile lists ${profileLine.join(" and ")}.`);
  }

  if (!cleanDescription && !normalizedHighlights) {
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
