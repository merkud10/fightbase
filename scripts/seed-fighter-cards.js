#!/usr/bin/env node

const https = require("https");

const { PrismaClient } = require("@prisma/client");

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
  {
    slug: "anatoly-malykhin",
    name: "Anatoly Malykhin",
    nameRu: "Анатолий Малыхин",
    nickname: null,
    officialPhotoUrl: "https://cdn.onefc.com/wp-content/uploads/2025/01/Anatoly_Malykhin-hero-champ-1200x1165-1.jpg",
    wikiTitle: "Anatoly_Malykhin",
    country: "Russia",
    weightClass: "Heavyweight",
    status: "active",
    record: "15-1",
    age: 37,
    heightCm: 180,
    reachCm: 190,
    team: "Golden Team",
    style: "Wrestle-boxing",
    bio: "Компактный тяжеловес с агрессией, силой в разменах и хорошим чувством момента для финиша.",
    promotionSlug: "one"
  },
  {
    slug: "christian-lee",
    name: "Christian Lee",
    nameRu: "Кристиан Ли",
    nickname: "The Warrior",
    officialPhotoUrl: "https://cdn.onefc.com/wp-content/uploads/2017/02/Christian_Lee-hero-1200x1165-3.jpg",
    wikiTitle: "Christian_Lee_(fighter)",
    country: "Singapore",
    weightClass: "Lightweight",
    status: "champion",
    record: "18-4",
    age: 27,
    heightCm: 178,
    reachCm: 188,
    team: "United MMA",
    style: "Well-rounded",
    bio: "Универсальный чемпион ONE с хорошим таймингом, борьбой и умением дожимать соперника у сетки.",
    promotionSlug: "one"
  },
  {
    slug: "jarred-brooks",
    name: "Jarred Brooks",
    nameRu: "Джарред Брукс",
    nickname: "The Monkey God",
    officialPhotoUrl: "https://cdn.onefc.com/wp-content/uploads/2021/10/Jarred-Brooks_hero-1200x1165-1.jpg",
    wikiTitle: "Jarred_Brooks",
    country: "United States",
    weightClass: "Strawweight",
    status: "active",
    record: "21-5",
    age: 32,
    heightCm: 160,
    reachCm: 163,
    team: "Mash Fight Team",
    style: "Wrestling",
    bio: "Низкий центр тяжести, агрессивные проходы и постоянный контроль делают его очень неприятным соперником.",
    promotionSlug: "one"
  },
  {
    slug: "reinier-de-ridder",
    name: "Reinier de Ridder",
    nameRu: "Ренье де Риддер",
    nickname: "The Dutch Knight",
    officialPhotoUrl: "https://cdn.onefc.com/wp-content/uploads/2019/01/Reinier_De_Ridder-hero-1200x1165-Champion.jpg",
    wikiTitle: "Reinier_de_Ridder",
    country: "Netherlands",
    weightClass: "Middleweight",
    status: "active",
    record: "20-4",
    age: 35,
    heightCm: 193,
    reachCm: 198,
    team: "Combat Brothers",
    style: "Submission Grappling",
    bio: "Высокий и опасный грэпплер, который любит навязывать клинч и собирать ошибки соперника в партере.",
    promotionSlug: "one"
  },
  {
    slug: "joshua-pacio",
    name: "Joshua Pacio",
    nameRu: "Джошуа Пасио",
    nickname: "The Passion",
    wikiTitle: "Joshua_Pacio",
    country: "Philippines",
    weightClass: "Strawweight",
    status: "champion",
    record: "24-4",
    age: 29,
    heightCm: 163,
    reachCm: 170,
    team: "Lions Nation MMA",
    style: "Wushu / Boxing",
    bio: "Один из символов ONE в минимальном весе, опасный за счет темпа, корпуса и атак сериями.",
    promotionSlug: "one"
  },
  {
    slug: "adriano-moraes",
    name: "Adriano Moraes",
    nameRu: "Адриано Мораес",
    nickname: "Mikinho",
    wikiTitle: "Adriano_Moraes",
    country: "Brazil",
    weightClass: "Flyweight",
    status: "active",
    record: "21-5",
    age: 36,
    heightCm: 173,
    reachCm: 173,
    team: "American Top Team",
    style: "Jiu-Jitsu / MMA",
    bio: "Бывший чемпион ONE с очень хорошим контролем спины и уверенной работой в чемпионских раундах.",
    promotionSlug: "one"
  },
  {
    slug: "fabricio-andrade",
    name: "Fabricio Andrade",
    nameRu: "Фабрисио Андраде",
    nickname: "Wonder Boy",
    wikiTitle: "Fabricio_Andrade",
    country: "Brazil",
    weightClass: "Bantamweight",
    status: "champion",
    record: "10-2",
    age: 28,
    heightCm: 170,
    reachCm: 183,
    team: "Marrok Force",
    style: "Striking",
    bio: "Взрывной ударник с очень плотными сериями, сильной работой по корпусу и хорошим чувством дистанции.",
    promotionSlug: "one"
  },
  {
    slug: "francis-ngannou",
    name: "Francis Ngannou",
    nameRu: "Фрэнсис Нганну",
    nickname: "The Predator",
    wikiTitle: "Francis_Ngannou",
    country: "Cameroon",
    weightClass: "Heavyweight",
    status: "active",
    record: "18-3",
    age: 39,
    heightCm: 193,
    reachCm: 211,
    team: "Xtreme Couture",
    style: "Boxing / Power Striking",
    bio: "Один из самых опасных тяжеловесов современности с редкой силой удара и огромным медийным весом.",
    promotionSlug: "pfl"
  },
  {
    slug: "dakota-ditcheva",
    name: "Dakota Ditcheva",
    nameRu: "Дакота Дитчева",
    nickname: null,
    officialPhotoUrl: "https://pflmma-prod.s3.amazonaws.com/fighters/banners/70a7a330e80538e2a44de04e0c856a5e-1.jpg",
    wikiTitle: "Dakota_Ditcheva",
    country: "England",
    weightClass: "Flyweight",
    status: "active",
    record: "14-0",
    age: 27,
    heightCm: 173,
    reachCm: 178,
    team: "Bad Company",
    style: "Muay Thai / MMA Striking",
    bio: "Одна из самых ярких молодых звезд PFL с опасной корпусной атакой и финишерским инстинктом.",
    promotionSlug: "pfl"
  },
  {
    slug: "johnny-eblen",
    name: "Johnny Eblen",
    nameRu: "Джонни Эблен",
    nickname: null,
    officialPhotoUrl: "https://pflmma-prod.s3.amazonaws.com/fighters/banners/8351b715709331634a31f3c58daecf4d-1.jpg",
    wikiTitle: "Johnny_Eblen",
    country: "United States",
    weightClass: "Middleweight",
    status: "active",
    record: "16-2",
    age: 34,
    heightCm: 185,
    reachCm: 188,
    team: "American Top Team",
    style: "Wrestling / Top Control",
    bio: "Средневес, который строит бои через давление, физическую силу и очень надежный контроль сверху.",
    promotionSlug: "pfl"
  },
  {
    slug: "renan-ferreira",
    name: "Renan Ferreira",
    nameRu: "Ренан Феррейра",
    nickname: "Problema",
    officialPhotoUrl: "https://pflmma-prod.s3.amazonaws.com/fighters/banners/fe4242d6b44271d9ba5475b1dcd02a84.jpg",
    wikiTitle: "Renan_Ferreira_(fighter)",
    country: "Brazil",
    weightClass: "Heavyweight",
    status: "active",
    record: "14-4",
    age: 35,
    heightCm: 203,
    reachCm: 213,
    team: "Team Nogueira",
    style: "Kickboxing",
    bio: "Габаритный тяжеловес с длинными рычагами и очень опасной ударной мощью в стартовых разменах.",
    promotionSlug: "pfl"
  },
  {
    slug: "abdoul-abdouraguimov",
    name: "Abdoul Abdouraguimov",
    nameRu: "Абдул Абдурагимов",
    nickname: "Lazy King",
    officialPhotoUrl: "https://upload.wikimedia.org/wikipedia/commons/7/78/Lazy_King_double_champ.jpg",
    wikiTitle: "Abdoul_Abdouraguimov",
    wikiLang: "fr",
    country: "France",
    weightClass: "Welterweight",
    status: "active",
    record: "19-1-1",
    age: 30,
    heightCm: 178,
    reachCm: 180,
    team: "Delariva Nantes",
    style: "Grappling",
    bio: "Очень техничный боец с сильной позиционной борьбой и опасной сабмишен-базой.",
    promotionSlug: "pfl"
  },
  {
    slug: "usman-nurmagomedov",
    name: "Usman Nurmagomedov",
    nameRu: "Усман Нурмагомедов",
    nickname: null,
    officialPhotoUrl: "https://pflmma-prod.s3.amazonaws.com/fighters/banners/1ed9fdda34774af72f2a1a4ccd50dc21-1.jpg",
    wikiTitle: "Usman_Nurmagomedov",
    country: "Russia",
    weightClass: "Lightweight",
    status: "champion",
    record: "20-0",
    age: 28,
    heightCm: 180,
    reachCm: 183,
    team: "Nurmagomedov School",
    style: "Sambo / Kickboxing",
    bio: "Чемпион с универсальной базой, способный одинаково уверенно работать в стойке и на земле.",
    promotionSlug: "pfl"
  },
  {
    slug: "patchy-mix",
    name: "Patchy Mix",
    nameRu: "Патчи Микс",
    nickname: null,
    officialPhotoUrl: "https://ufc.com/images/2025-10/MIX_PATCHY_10-04.png",
    wikiTitle: "Patchy_Mix",
    country: "United States",
    weightClass: "Bantamweight",
    status: "active",
    record: "20-4",
    age: 32,
    heightCm: 180,
    reachCm: 183,
    team: "Jackson Wink MMA",
    style: "Grappling",
    bio: "Очень цепкий легчайший вес с сильной работой на спине и опасной игрой в сабмишены.",
    promotionSlug: "pfl"
  },
  {
    slug: "larissa-pacheco",
    name: "Larissa Pacheco",
    nameRu: "Ларисса Пачеко",
    nickname: null,
    wikiTitle: "Larissa_Pacheco",
    country: "Brazil",
    weightClass: "Featherweight",
    status: "champion",
    record: "26-5",
    age: 31,
    heightCm: 168,
    reachCm: 170,
    team: "Team Cross Fight",
    style: "Striking / MMA",
    bio: "Одна из самых опасных чемпионок PFL с жесткой ударной манерой и хорошей физической мощью.",
    promotionSlug: "pfl"
  },
  {
    slug: "aj-mckee",
    name: "A.J. McKee",
    nameRu: "Эй Джей Макки",
    nickname: "Mercenary",
    wikiTitle: "AJ_McKee",
    country: "United States",
    weightClass: "Lightweight",
    status: "active",
    record: "22-2",
    age: 31,
    heightCm: 178,
    reachCm: 187,
    team: "Bodyshop Fitness",
    style: "Striking / Grappling",
    bio: "Очень атлетичный и опасный финишер, который комфортно чувствует себя в разменах и в сабмишенах.",
    promotionSlug: "pfl"
  },
  {
    slug: "patricio-pitbull",
    name: "Patricio Pitbull",
    nameRu: "Патрисио Питбуль",
    nickname: "Pitbull",
    wikiTitle: "Patr%C3%ADcio_Freire",
    country: "Brazil",
    weightClass: "Featherweight",
    status: "active",
    record: "36-8",
    age: 38,
    heightCm: 168,
    reachCm: 165,
    team: "Pitbull Brothers",
    style: "Boxing / Power Striking",
    bio: "Легенда мировой ММА-сцены с огромным чемпионским опытом, тяжелым ударом и умением включаться в ключевые моменты боя.",
    promotionSlug: "pfl"
  }
];

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

  for (const fighter of fighters) {
    const promotionId = promotionMap[fighter.promotionSlug];
    if (!promotionId) {
      throw new Error(`Promotion not found for slug: ${fighter.promotionSlug}`);
    }

    const photoUrl = await resolvePhotoUrl(fighter);

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
