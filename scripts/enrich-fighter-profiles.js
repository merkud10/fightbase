#!/usr/bin/env node

const https = require("https");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const fighterConfigs = [
  {
    slug: "alex-pereira",
    wikiTitle: "Alex_Pereira",
    wikiLang: "en",
    nameRu: "Алекс Перейра",
    photoUrl: "https://ufc.com/images/2025-03/PEREIRA_ALEX_BELT_03-08.png",
    bioRu:
      "Алекс Перейра — бразильский боец ММА и бывший элитный кикбоксер, прославившийся нокаутирующей мощью и хладнокровной работой на дистанции. В UFC он успел завоевать титулы в среднем и полутяжелом весе, а переход из кикбоксинга в ММА сделал в рекордно короткие сроки. Перейра особенно опасен в стойке, где сочетает тайминг, жесткий левый хук и редкое спокойствие под давлением."
  },
  {
    slug: "islam-makhachev",
    wikiTitle: "Islam_Makhachev",
    wikiLang: "en",
    nameRu: "Ислам Махачев",
    photoUrl: "https://ufc.com/images/2025-01/7/MAKHACHEV_ISLAM_BELT_01-18.png",
    bioRu:
      "Ислам Махачев — российский боец из Дагестана, один из главных представителей школы боевого самбо в современном ММА. Он построил карьеру на контроле в партере, позиционной дисциплине и умении постепенно ломать соперника по ходу боя. Махачев долгое время был ключевой фигурой легкого веса UFC и остается эталоном тактического давления в чемпионских поединках."
  },
  {
    slug: "shavkat-rakhmonov",
    wikiTitle: "Shavkat_Rakhmonov",
    wikiLang: "en",
    nameRu: "Шавкат Рахмонов",
    photoUrl: "https://ufc.com/images/2025-01/5/RAKHMONOV_SHAVKAT_12-07.png",
    bioRu:
      "Шавкат Рахмонов — казахстанский полусредневес, которого ценят за универсальность и умение финишировать в любой фазе боя. Он одинаково опасен в стойке и на земле, а его фирменный стиль строится на давлении, длинных комбинациях и спокойствии в разменах. Рахмонов быстро превратился из перспективного проспекта в постоянного участника титульных разговоров UFC."
  },
  {
    slug: "ilia-topuria",
    wikiTitle: "Ilia_Topuria",
    wikiLang: "en",
    nameRu: "Илия Топурия",
    photoUrl: "https://ufc.com/images/2025-06/TOPURIA_ILIA_BELT_10-26.png",
    bioRu:
      "Илия Топурия — один из самых ярких бойцов нового поколения, представляющий Грузию и Испанию. Он сочетает плотный бокс, уверенную борьбу и редкую для топ-уровня уверенность в разменах, из-за чего быстро вышел в число главных звезд UFC. Топурия известен тем, что навязывает соперникам высокий темп и часто заканчивает эпизоды серийной атакой."
  },
  {
    slug: "merab-dvalishvili",
    wikiTitle: "Merab_Dvalishvili",
    wikiLang: "en",
    nameRu: "Мераб Двалишвили",
    photoUrl: "https://ufc.com/images/2024-09/DVALISHVILI_MERAB_CG_09-14.png",
    bioRu:
      "Мераб Двалишвили — грузинский боец, который стал символом бешеного темпа и непрерывного прессинга в легчайшем весе UFC. Его стиль строится на серийных проходах в ноги, постоянном движении и способности держать высокий объем работы все пять раундов. За счет этого Двалишвили превратился в одну из ключевых фигур дивизиона и постоянного участника титульной гонки."
  },
  {
    slug: "tom-aspinall",
    wikiTitle: "Tom_Aspinall",
    wikiLang: "en",
    nameRu: "Том Аспиналл",
    photoUrl: "https://ufc.com/images/2025-10/ASPINALL_TOM_BELT_10-25.png",
    bioRu:
      "Том Аспиналл — британский тяжеловес, которого выделяют скорость рук, техника на выходах и редкая для дивизиона мобильность. Он одинаково опасен в разменах и в партере, а многие победы оформлял в стартовых минутах за счет резкого старта. Аспиналл считается одним из самых техничных тяжеловесов новой волны в UFC."
  },
  {
    slug: "dricus-du-plessis",
    wikiTitle: "Dricus_du_Plessis",
    wikiLang: "en",
    nameRu: "Дрикус дю Плесси",
    photoUrl: "https://ufc.com/images/2024-01/DU_PLESSIS_DRICUS_01-20.png",
    bioRu:
      "Дрикус дю Плесси — южноафриканский боец, который прошел путь от региональных титулов до чемпионских боев в UFC. Его стиль не всегда выглядит академично, но он крайне неудобен за счет физической мощи, постоянного давления и умения выживать в тяжелых эпизодах. Дю Плесси особенно опасен там, где бой превращается в хаотичную силовую схватку."
  },
  {
    slug: "belal-muhammad",
    wikiTitle: "Belal_Muhammad",
    wikiLang: "en",
    nameRu: "Белал Мухаммад",
    photoUrl: "https://ufc.com/images/2025-11/MUHAMMAD_BELAL_11-22.png",
    bioRu:
      "Белал Мухаммад — американский полусредневес палестинского происхождения, сделавший карьеру на дисциплине, объеме и умении выигрывать длинные тактические бои. Он не зависит от одного яркого оружия, зато стабильно работает сериями, хорошо контролирует темп и редко отдает инициативу. Именно эта системность позволила ему закрепиться среди сильнейших полусредневесов мира."
  },
  {
    slug: "movsar-evloev",
    wikiTitle: "Movsar_Evloev",
    wikiLang: "en",
    nameRu: "Мовсар Евлоев",
    photoUrl: "https://ufc.com/images/2026-03/EVLOEV_MOVSAR_03-21.png",
    bioRu:
      "Мовсар Евлоев — российский полулегковес, известный как крайне неудобный соперник с плотной борьбой и высоким бойцовским IQ. Он редко позволяет оппоненту развить свою игру и почти всегда навязывает бой в выгодных для себя позициях. Евлоев идет по дивизиону за счет контроля, темпа и умения не допускать лишнего риска."
  },
  {
    slug: "patchy-mix",
    wikiTitle: "Patchy_Mix",
    wikiLang: "en",
    nameRu: "Патчи Микс",
    photoUrl: "https://ufc.com/images/2025-10/MIX_PATCHY_10-04.png",
    bioRu:
      "Патчи Микс — американский боец легчайшего веса, закрепившийся среди сильнейших бойцов дивизиона за счет чемпионского уровня борьбы и побед в крупных титульных боях. Его сильнейшее оружие — работа на спине, контроль в клинче и цепкая игра в партере. Микс опасен именно тем, что способен превратить любой обмен в эпизод для захвата или контроля."
  },
];
const ufcFighterConfigs = fighterConfigs;


const opponentTranslations = {
  "Alexander Volkanovski": "Александр Волкановски",
  "Alfie Davis": "Альфи Дэвис",
  "Alibeg Rasulov": "Алибег Расулов",
  "Aljamain Sterling": "Алджамейн Стерлинг",
  "Arjan Bhullar": "Арджан Буллар",
  "Arnold Allen": "Арнольд Аллен",
  "Brad Wheeler": "Брэд Уилер",
  "Brendan Allen": "Брендан Аллен",
  "Bryan Battle": "Брайан Бэттл",
  "Caio Borralho": "Кайо Борральо",
  "Carl Booth": "Карл Бут",
  "Charles Oliveira": "Чарльз Оливейра",
  "Ciryl Gane": "Сирил Ган",
  "Cory Sandhagen": "Кори Сэндхэген",
  "Costello van Steenis": "Костелло ван Стенис",
  "Curtis Blaydes": "Кертис Блэйдс",
  "Dustin Poirier": "Дастин Порье",
  "Fabian Edwards": "Фабиан Эдвардс",
  "Gael Grimaud": "Гаэль Гримо",
  "Geoff Neal": "Джефф Нил",
  "Ian Machado Garry": "Иэн Гэрри",
  "Israel Adesanya": "Исраэль Адесанья",
  "Jack Della Maddalena": "Джек Делла Маддалена",
  "Jack Grant": "Джек Грант",
  "Jakub Wikłacz": "Якуб Виклач",
  "Jena Bishop": "Джена Бишоп",
  "Joshua Pacio": "Джошуа Пасио",
  "Khalil Rountree Jr.": "Халил Раунтри-младший",
  "Khamzat Chimaev": "Хамзат Чимаев",
  "Kiamrian Abbasov": "Кямран Аббасов",
  "Kyoma Akimoto": "Кёма Акимото",
  "Leon Edwards": "Леон Эдвардс",
  "Lerone Murphy": "Лерон Мёрфи",
  "Louis Glismann": "Луи Глиссман",
  "Magomed Ankalaev": "Магомед Анкалаев",
  "Mansur Malachiev": "Мансур Малахиев",
  "Mario Bautista": "Марио Баутиста",
  "Max Holloway": "Макс Холлоуэй",
  "Oumar Kane": "Умар Кейн",
  "Paul Hughes": "Пол Хьюз",
  "Petr Yan": "Петр Ян",
  "Rafal Haratyk": "Рафал Гаратык",
  "Reece McLaren": "Рис Макларен",
  "Reinier de Ridder": "Ренье де Риддер",
  "Renato Moicano": "Ренато Мойкано",
  "Robert Whittaker": "Роберт Уиттакер",
  "Sean O'Malley": "Шон О'Мэлли",
  "Sean Strickland": "Шон Стрикленд",
  "Sergei Pavlovich": "Сергей Павлович",
  "Stephen Thompson": "Стивен Томпсон",
  "Sumiko Inaba": "Сумико Инаба",
  "Taila Santos": "Тайла Сантос",
  "Viscardi Andrade": "Вискарди Андраде"
};

const monthMap = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  janvier: 0,
  fevrier: 1,
  "fГ©vrier": 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  "aoГ»t": 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  "dГ©cembre": 11
};

const directMethodMap = {
  "decision (unanimous)": "Решение судей (единогласное)",
  "decision (split)": "Решение судей (раздельное)",
  "decision (majority)": "Решение судей (большинством голосов)",
  "décision (unanime)": "Решение судей (единогласное)",
  "décision (partagée)": "Решение судей (раздельное)",
  "submission (rear-naked choke)": "Сабмишен (удушение сзади)",
  "submission (brabo choke)": "Сабмишен (удушение брабо)",
  "submission (north-south choke)": "Сабмишен (удушение север-юг)",
  "submission (guillotine choke)": "Сабмишен (гильотина)",
  "submission (face crank)": "Сабмишен (фэйс-кранк)",
  "technical submission (rear-naked choke)": "Технический сабмишен (удушение сзади)",
  "technical submission (north-south choke)": "Технический сабмишен (удушение север-юг)",
  "ko (punches)": "KO (удары)",
  "ko (punch)": "KO (удар)",
  "tko (punches)": "TKO (удары)",
  "tko (punches and elbows)": "TKO (удары и локти)",
  "tko (elbows and punches)": "TKO (локти и удары)",
  "tko (knee and punches)": "TKO (колено и удары)",
  "tko (knees)": "TKO (колени)",
  "tko (retirement)": "TKO (отказ от продолжения боя)",
  "tko (doctor stoppage)": "TKO (остановка врачом)",
  "tko (corner stoppage)": "TKO (остановка углом)",
  "tko (front kick to the body and punch)": "TKO (удар ногой по корпусу и добивание)",
  "tko (punches to the body)": "TKO (удары по корпусу)",
  "tko (punches and soccer kicks)": "TKO (удары и соккер-кики)",
  "nc (accidental eye poke)": "NC (случайный тычок в глаз)",
  "nc (eye poke)": "NC (тычок в глаз)",
  "soumission (étranglement arrière)": "Сабмишен (удушение сзади)",
  "soumission (etranglement arriere)": "Сабмишен (удушение сзади)",
  "soumission (clé de talon)": "Сабмишен (скручивание пятки)",
  "soumission (cle de talon)": "Сабмишен (скручивание пятки)",
  "soumission (guillotine)": "Сабмишен (гильотина)"
};

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\[\d+\]/g, "")
    .trim();
}

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

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

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

async function fetchFighterSourceData(config) {
  const summaryUrl = `https://${config.wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(config.wikiTitle)}`;
  const pageUrl =
    `https://${config.wikiLang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(config.wikiTitle)}` +
    "&prop=text&formatversion=2&format=json";

  const [summaryPayload, pagePayload] = await Promise.all([fetchJson(summaryUrl), fetchJson(pageUrl)]);

  return {
    photoUrl: config.photoUrl || summaryPayload.originalimage?.source || summaryPayload.thumbnail?.source || null,
    html: pagePayload.parse?.text || "",
    summary: stripTags(summaryPayload.extract || "")
  };
}

function extractRecentFightRows(html) {
  const headerCandidates = ["<th scope=\"col\">Opponent", "<th scope=\"col\">Adversaire", "<th scope=\"col\">Event", "<th scope=\"col\">Г‰vГ©nement"];
  const headerIndex = headerCandidates.map((candidate) => html.indexOf(candidate)).find((index) => index !== -1) ?? -1;

  if (headerIndex === -1) {
    return [];
  }

  const tableStart = html.lastIndexOf("<table", headerIndex);
  const tableEnd = html.indexOf("</table>", headerIndex);
  if (tableStart === -1 || tableEnd === -1) {
    return [];
  }

  const tableHtml = html.slice(tableStart, tableEnd);
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  const fights = [];

  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => stripTags(match[1]));
    if (cells.length < 6) {
      continue;
    }

    fights.push({
      result: cells[0],
      opponentName: cells[2],
      method: cells[3],
      eventName: cells[4],
      date: cells[5],
      round: cells[6] || null,
      time: cells[7] || null,
      notes: cells[9] || null
    });
  }

  return fights.slice(0, 3);
}

function parseWikiDate(value) {
  const normalized = stripTags(value)
    .toLowerCase()
    .replace(/1er/g, "1")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const day = Number(match[1]);
  const month = monthMap[match[2]];
  const year = Number(match[3]);

  if (month == null || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return new Date(Date.UTC(year, month, day, 21, 0, 0));
}

function translateResult(result) {
  const normalized = stripTags(result).toLowerCase();

  if (normalized === "win" || normalized === "victoire") {
    return "Победа";
  }

  if (normalized === "loss" || normalized === "dГ©faite" || normalized === "defaite") {
    return "Поражение";
  }

  if (normalized === "draw" || normalized === "Г©galitГ©" || normalized === "egalite") {
    return "Ничья";
  }

  if (normalized === "nc" || normalized.includes("no contest") || normalized.includes("sans dГ©cision") || normalized.includes("sans decision")) {
    return "Несостоявшийся бой";
  }

  return stripTags(result);
}

function translateOpponentName(name) {
  const clean = stripTags(name);
  return opponentTranslations[clean] || clean;
}

function translateMethod(method) {
  const clean = stripTags(method);
  if (!clean) {
    return null;
  }

  const normalized = clean.toLowerCase();
  if (directMethodMap[normalized]) {
    return directMethodMap[normalized];
  }

  return clean
    .replace(/^Décision/i, "Решение")
    .replace(/^Decision/i, "Решение")
    .replace(/^Soumission/i, "Сабмишен")
    .replace(/^Submission/i, "Сабмишен")
    .replace(/^Technical submission/i, "Технический сабмишен")
    .replace(/unanimous/gi, "единогласное")
    .replace(/split/gi, "раздельное")
    .replace(/majority/gi, "большинством голосов")
    .replace(/rear-naked choke/gi, "удушение сзади")
    .replace(/brabo choke/gi, "удушение брабо")
    .replace(/north-south choke/gi, "удушение север-юг")
    .replace(/guillotine choke/gi, "гильотина")
    .replace(/face crank/gi, "фэйс-кранк")
    .replace(/étranglement arrière/gi, "удушение сзади")
    .replace(/etranglement arriere/gi, "удушение сзади")
    .replace(/clé de talon/gi, "скручивание пятки")
    .replace(/cle de talon/gi, "скручивание пятки")
    .replace(/punches to the body/gi, "удары по корпусу")
    .replace(/soccer kicks/gi, "соккер-кики")
    .replace(/\band\b/gi, "и")
    .replace(/punches/gi, "удары")
    .replace(/punch/gi, "удар")
    .replace(/elbows/gi, "локти")
    .replace(/knees/gi, "колени")
    .replace(/knee/gi, "колено")
    .replace(/eye poke/gi, "тычок в глаз")
    .replace(/\s+/g, " ")
    .trim();
}

function translateChampionshipLabel(value) {
  const labels = {
    "ufc lightweight championship": "титул чемпиона UFC в легком весе",
    "ufc featherweight championship": "титул чемпиона UFC в полулегком весе",
    "ufc welterweight championship": "титул чемпиона UFC в полусреднем весе",
    "ufc heavyweight championship": "титул чемпиона UFC в тяжелом весе",
    "ufc bantamweight championship": "титул чемпиона UFC в легчайшем весе",
    "ufc light heavyweight championship": "титул чемпиона UFC в полутяжелом весе",
    "ufc middleweight championship": "титул чемпиона UFC в среднем весе"
  };

  return labels[stripTags(value).toLowerCase()] || null;
}

function translateNoteSentence(sentence) {
  const clean = stripTags(sentence).replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();

  if (!clean) {
    return null;
  }

  if (lower === "performance of the night") {
    return "Получил бонус «Выступление вечера».";
  }

  if (lower === "fight of the night") {
    return "Получил бонус «Бой вечера».";
  }

  if (lower.startsWith("won the vacant ")) {
    const label = translateChampionshipLabel(clean.slice("Won the vacant ".length));
    return label ? `Завоевал вакантный ${label}.` : null;
  }

  if (lower.startsWith("won the ")) {
    const target = clean.slice("Won the ".length);
    const label = translateChampionshipLabel(target);
    if (label) {
      return `Завоевал ${label}.`;
    }

  }

  if (lower.startsWith("defended the ")) {
    const label = translateChampionshipLabel(clean.slice("Defended the ".length));
    return label ? `Защитил ${label}.` : null;
  }

  if (lower.startsWith("lost the ")) {
    const label = translateChampionshipLabel(clean.slice("Lost the ".length));
    return label ? `Потерял ${label}.` : null;
  }

  if (lower.includes("semifinal")) {
    return "Полуфинал турнира.";
  }

  if (lower.includes("debut")) {
    if (lower.includes("middleweight")) {
      return "Дебют в среднем весе.";
    }
    if (lower.includes("welterweight")) {
      return "Дебют в полусреднем весе.";
    }
    if (lower.includes("lightweight")) {
      return "Дебют в легком весе.";
    }
    if (lower.includes("featherweight")) {
      return "Дебют в полулегком весе.";
    }
  }

  if (lower.includes("accidental eye poke")) {
    return "Бой был остановлен после случайного тычка в глаз.";
  }

  if (lower.includes("deducted one point")) {
    return "С бойца сняли одно очко.";
  }

  if (lower.includes("later vacated the title")) {
    return "Позднее освободил титул.";
  }

  if (lower.includes("broke the record")) {
    return "Установил рекорд дивизиона по успешным защитам.";
  }

  if (lower.includes("tied for the longest win streak")) {
    return "Повторил один из лучших победных отрезков в истории UFC.";
  }

  return null;
}

function translateNotes(notes, fight) {
  const clean = stripTags(notes);
  if (!clean) {
    return null;
  }

  const translated = clean
    .split(".")
    .map((sentence) => translateNoteSentence(sentence))
    .filter(Boolean);

  const unique = [...new Set(translated)];
  if (unique.length > 0) {
    return unique.join(" ");
  }

  if (fight.result === "Победа") {
    return "Победа в последнем зафиксированном бою.";
  }

  if (fight.result === "Поражение") {
    return "Поражение в последнем зафиксированном бою.";
  }

  if (fight.result === "Несостоявшийся бой") {
    return "Бой был признан несостоявшимся.";
  }

  return null;
}

async function enrichFighter(config) {
  const fighter = await prisma.fighter.findUnique({
    where: { slug: config.slug }
  });

  if (!fighter) {
    console.log(`Skipped missing fighter: ${config.slug}`);
    return;
  }

  const sourceData = await fetchFighterSourceData(config);
  const recentFights = extractRecentFightRows(sourceData.html);

  await prisma.fighter.update({
    where: { id: fighter.id },
    data: {
      nameRu: config.nameRu,
      photoUrl: sourceData.photoUrl ?? fighter.photoUrl,
      bio: config.bioRu,
      bioEn: sourceData.summary || fighter.bioEn || null
    }
  });

  await prisma.fighterRecentFight.deleteMany({
    where: { fighterId: fighter.id }
  });

  for (const fight of recentFights) {
    const parsedDate = parseWikiDate(fight.date);
    if (!parsedDate) {
      continue;
    }

    const result = translateResult(fight.result);

    await prisma.fighterRecentFight.create({
      data: {
        fighterId: fighter.id,
        opponentName: stripTags(fight.opponentName),
        opponentNameRu: translateOpponentName(fight.opponentName),
        eventName: stripTags(fight.eventName),
        result,
        method: translateMethod(fight.method),
        date: parsedDate,
        round: fight.round ? Number.parseInt(fight.round, 10) || null : null,
        time: fight.time ? stripTags(fight.time) : null,
        weightClass: fighter.weightClass,
        notes: translateNotes(fight.notes, { result })
      }
    });
  }

  console.log(`Enriched fighter: ${fighter.name} -> ${config.nameRu}`);
}

async function main() {
  for (const config of ufcFighterConfigs) {
    try {
      await enrichFighter(config);
    } catch (error) {
      console.error(`Failed to enrich ${config.slug}: ${error.message || error}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
