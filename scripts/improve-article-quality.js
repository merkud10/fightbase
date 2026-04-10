const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const articleOverrides = {
  "ufc-london-evloev-vs-murphy": {
    title: "Результаты турнира UFC London: главные итоги",
    excerpt:
      "Мовсар Евлоев победил Лерона Мерфи в главном бою турнира UFC London, а Люк Райли, Майкл Веном Пейдж и Кристиан Лерой Данкан одержали важные победы на основном карде.",
    body:
      "Турнир UFC London, который прошел 21 марта 2026 года на арене O2 в Лондоне, завершился важным боем в полулегком весе между Мовсаром Евлоевым и Лероном Мерфи.\n\nГлавное событие вечера получилось конкурентным и напряженным. После пяти раундов судьи отдали победу Евлоеву. Для россиянина это десятая подряд победа в UFC и двадцатая победа подряд в профессиональной карьере.\n\nВ соглавном бою Люк Райли победил Майкла Эсвелла-младшего единогласным решением судей. Для британца это вторая победа в UFC и тринадцатая подряд победа на профессиональном уровне.\n\nМайкл Веном Пейдж также выиграл на основном карде, взяв верх над Сэмом Паттерсоном по итогам трех раундов. Еще одну важную победу одержал Кристиан Лерой Данкан, который оказался сильнее Романа Долидзе и укрепил свои позиции в дивизионе."
  },
  "ufc-328": {
    title: "Чимаев и Стрикленд возглавят UFC 328",
    excerpt:
      "UFC объявила главный бой турнира UFC 328: за титул в среднем весе встретятся Хамзат Чимаев и Шон Стрикленд. В соглавном событии Александр Волков подерется с Уолдо Кортесом-Акостой.",
    body:
      "UFC официально объявила главный бой турнира UFC 328. 9 мая в Prudential Center в Ньюарке за титул чемпиона в среднем весе встретятся Хамзат Чимаев и Шон Стрикленд.\n\nДля Чимаева этот поединок станет очередной попыткой закрепить статус главной силы дивизиона. К турниру он подходит после серии громких побед над топовыми соперниками и теперь получит возможность провести еще одну титульную защиту на крупном номерном шоу.\n\nСтрикленд, в свою очередь, выходит на бой как один из самых узнаваемых претендентов дивизиона и бывший чемпион. Для американца это шанс вернуть пояс и снова выйти на вершину среднего веса.\n\nВ соглавном событии вечера Александр Волков встретится с Уолдо Кортесом-Акостой в тяжелом весе. UFC также подтвердила дату старта продаж билетов и объявила расписание предварительного и основного карда."
  },
  "ufc-abc-ufc": {
    title: "ABC станет регуляторным консультантом турнира UFC в Белом доме",
    excerpt:
      "Ассоциация боксерских комиссий поможет UFC с регуляторным сопровождением исторического турнира на территории Белого дома, который запланирован на 14 июня 2026 года.",
    body:
      "UFC объявила, что Ассоциация боксерских комиссий будет выступать регуляторным консультантом турнира, который планируется провести на территории Белого дома 14 июня 2026 года.\n\nОрганизация заявила, что все поединки на этом шоу будут официально лицензированы и санкционированы, а сама ABC поможет выстроить структуру судейства, инспекции и общего регуляторного контроля.\n\nВ UFC подчеркнули, что рассматривают этот турнир как событие исключительного масштаба и намерены провести его по самым строгим стандартам безопасности и спортивного администрирования. Для этого к подготовке будут привлечены руководители регуляторного блока компании.\n\nПо словам представителей ABC и UFC, сотрудничество должно обеспечить прозрачные правила, медицинские протоколы и контроль за проведением шоу на уровне крупнейших профессиональных турниров по ММА."
  },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function replaceAllInsensitive(value, search, replacement) {
  if (!search || !search.trim()) {
    return value;
  }

  return value.replace(new RegExp(`\\b${escapeRegExp(search)}\\b`, "gi"), replacement);
}

const commonReplacements = [
  [/\bvs\.?\b/gi, "против"],
  [/\bmain card\b/gi, "главный кард"],
  [/\bprelims?\b/gi, "предварительный кард"],
  [/\bfight card\b/gi, "кард"],
  [/\blive results?\b/gi, "результаты"],
  [/\bhighlights\b/gi, "главные моменты"],
  [/\btickets on sale\b/gi, "билеты поступят в продажу"],
  [/\bon sale\b/gi, "в продаже"],
  [/\btitle fight\b/gi, "титульный бой"],
  [/\bchampionship fight\b/gi, "титульный бой"],
  [/\bchampionship battle\b/gi, "титульный бой"]
];

function applyCommonReplacements(value) {
  let next = value;

  for (const [pattern, replacement] of commonReplacements) {
    next = next.replace(pattern, replacement);
  }

  next = next
    .replace(/\*\*/g, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/([«„])\s+/g, "$1")
    .replace(/\s+([»“])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+-\s+/g, " — ");

  return normalizeWhitespace(next);
}

function applyFighterNames(value, fighters) {
  let next = value;

  for (const fighter of fighters) {
    if (!fighter.nameRu || fighter.nameRu === fighter.name) {
      continue;
    }

    next = replaceAllInsensitive(next, fighter.name, fighter.nameRu);

    const parts = fighter.name.split(" ").filter(Boolean);
    const ruParts = fighter.nameRu.split(" ").filter(Boolean);
    if (parts.length >= 2 && ruParts.length >= 2) {
      next = replaceAllInsensitive(next, parts[0], ruParts[0]);
      next = replaceAllInsensitive(next, parts[parts.length - 1], ruParts[ruParts.length - 1]);
    }
  }

  return next;
}

function cleanNewsText(value, fighters) {
  return applyFighterNames(applyCommonReplacements(value), fighters);
}

function cleanNewsTitle(value, fighters) {
  let next = cleanNewsText(value, fighters);
  next = next
    .replace(/\bРезультат(ы)? основного боя\b/gi, "Результат главного боя")
    .replace(/\bГлавные моменты и победители\b/gi, "главные итоги турнира")
    .replace(/\bПолный результат турнира\b/gi, "Полные результаты турнира");
  return normalizeWhitespace(next);
}

function buildMeaning(text) {
  const excerpt = normalizeWhitespace(text).slice(0, 160).trimEnd();
  return excerpt ? `Почему это важно: ${excerpt}${excerpt.length >= 160 ? "..." : ""}` : "";
}

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      category: "news"
    },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" }
      },
      fighterMap: {
        include: {
          fighter: {
            select: {
              name: true,
              nameRu: true
            }
          }
        }
      }
    }
  });

  let updated = 0;

  for (const article of articles) {
    const fighters = article.fighterMap.map((item) => item.fighter);
    const override = articleOverrides[article.slug];
    const title = override?.title ?? cleanNewsTitle(article.title, fighters);
    const excerpt = override?.excerpt ?? cleanNewsText(article.excerpt, fighters);
    const sectionUpdates = article.sections.map((section) => ({
      id: section.id,
      body: override?.body ?? cleanNewsText(section.body, fighters)
    }));
    const meaning = buildMeaning(sectionUpdates[0]?.body || excerpt);

    const changed =
      title !== article.title ||
      excerpt !== article.excerpt ||
      meaning !== article.meaning ||
      sectionUpdates.some((section, index) => section.body !== article.sections[index].body);

    if (!changed) {
      continue;
    }

    await prisma.$transaction([
      prisma.article.update({
        where: { id: article.id },
        data: {
          title,
          excerpt,
          meaning
        }
      }),
      ...sectionUpdates.map((section) =>
        prisma.articleSection.update({
          where: { id: section.id },
          data: {
            body: section.body
          }
        })
      )
    ]);

    updated += 1;
  }

  console.log(`Improved ${updated} articles`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
