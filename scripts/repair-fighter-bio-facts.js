#!/usr/bin/env node

// Точечно чинит факты в биографиях бойцов, не переписывая текст целиком.
//
// Био пишутся один раз и устаревают: боец проводит бой — поле record меняется,
// а абзац под шапкой продолжает называть старые цифры. На странице это читается
// как противоречие самой себе.
//
// Правим два факта и только их:
//   * рекорд — и цифрами («рекорд 22-9-1»), и прописью («17 побед и 8 поражений»);
//   * весовую категорию — ТОЛЬКО в настоящем времени («выступающий в лёгком весе»).
//
// Прошедшее время и описательные обороты («был ключевой фигурой лёгкого веса»)
// не трогаем: там старый дивизион упомянут верно — боец в нём действительно
// выступал. Такие случаи уходят в отчёт для ручного разбора.
//
// По умолчанию dry-run, запись только с --apply.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Предложный падеж прилагательного: «выступающий в ___ весе».
const DIVISION_PREPOSITIONAL = {
  Flyweight: "наилегчайшем",
  Bantamweight: "легчайшем",
  Featherweight: "полулёгком",
  Lightweight: "лёгком",
  Welterweight: "полусреднем",
  Middleweight: "среднем",
  "Light Heavyweight": "полутяжёлом",
  Heavyweight: "тяжёлом",
  "Women's Strawweight": "минимальном",
  "Women's Flyweight": "наилегчайшем",
  "Women's Bantamweight": "легчайшем",
  "Women's Featherweight": "полулёгком",
  "Women's Lightweight": "лёгком"
};

// Именительный падеж — форма из шаблонного био: «в категории «Лёгкий вес»».
const DIVISION_NOMINATIVE = {
  Flyweight: "Наилегчайший вес",
  Bantamweight: "Легчайший вес",
  Featherweight: "Полулёгкий вес",
  Lightweight: "Лёгкий вес",
  Welterweight: "Полусредний вес",
  Middleweight: "Средний вес",
  "Light Heavyweight": "Полутяжёлый вес",
  Heavyweight: "Тяжёлый вес",
  "Women's Strawweight": "Минимальный вес",
  "Women's Flyweight": "Наилегчайший вес",
  "Women's Bantamweight": "Легчайший вес",
  "Women's Featherweight": "Полулёгкий вес",
  "Women's Lightweight": "Лёгкий вес"
};

const KNOWN_PREPOSITIONAL = [...new Set(Object.values(DIVISION_PREPOSITIONAL))];
const KNOWN_NOMINATIVE = [...new Set(Object.values(DIVISION_NOMINATIVE))];

// Корни для проверки «остались ли противоречия» — те же, что в аудите качества.
const DIVISION_STEMS = {
  Flyweight: "наилегч",
  Bantamweight: "легчайш",
  Featherweight: "полулегк",
  Lightweight: "легк",
  Welterweight: "полусредн",
  Middleweight: "средн",
  "Light Heavyweight": "полутяж",
  Heavyweight: "тяж",
  "Women's Strawweight": "минимальн",
  "Women's Flyweight": "наилегч",
  "Women's Bantamweight": "легчайш",
  "Women's Featherweight": "полулегк",
  "Women's Lightweight": "легк"
};

// В корпусе «ё» пишется непоследовательно («лёгком» и «легком»), поэтому
// сравниваем формы, приведя их к «е».
function foldYo(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е");
}

function pluralizeRu(value, one, few, many) {
  const abs = Math.abs(Number(value) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function parseRecord(value) {
  const match = String(value || "").match(/^\s*(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (!match) {
    return null;
  }

  return { wins: Number(match[1]), losses: Number(match[2]), draws: match[3] ? Number(match[3]) : null };
}

// Цифры рекорда заменяем только рядом со словом «рекорд»: в тексте попадаются
// и другие пары чисел через дефис, которые рекордом не являются.
function fixRecordInBio(text, record) {
  const parsed = parseRecord(record);
  if (!parsed) {
    return { text, changed: false };
  }

  const canonical = String(record).trim();
  let changed = false;

  let next = text.replace(
    /(рекорд\S*\s+(?:составляет\s+)?)(\d+)\s+побед\S*\s+и\s+(\d+)\s+поражени\S*/gi,
    (whole, prefix, wins, losses) => {
      if (Number(wins) === parsed.wins && Number(losses) === parsed.losses) {
        return whole;
      }
      changed = true;
      const winWord = pluralizeRu(parsed.wins, "победа", "победы", "побед");
      const lossWord = pluralizeRu(parsed.losses, "поражение", "поражения", "поражений");
      return `${prefix}${parsed.wins} ${winWord} и ${parsed.losses} ${lossWord}`;
    }
  );

  next = next.replace(/(рекорд\S*\s+(?:составляет\s+)?)(\d+\s*-\s*\d+(?:\s*-\s*\d+)?)/gi, (whole, prefix, found) => {
    if (found.replace(/\s+/g, "") === canonical.replace(/\s+/g, "")) {
      return whole;
    }
    changed = true;
    return `${prefix}${canonical}`;
  });

  return { text: next, changed };
}

// Только настоящее время — прямое утверждение о текущем дивизионе.
function fixWeightClassInBio(text, weightClass) {
  const expected = DIVISION_PREPOSITIONAL[weightClass];
  if (!expected) {
    return { text, changed: false };
  }

  let changed = false;
  let next = text.replace(
    /(выступающ(?:ий|ая)\s+в\s+)([А-Яа-яЁё]+)(\s+весе)/g,
    (whole, prefix, adjective, suffix) => {
      const folded = foldYo(adjective);
      const isKnown = KNOWN_PREPOSITIONAL.some((form) => foldYo(form) === folded);
      if (!isKnown || folded === foldYo(expected)) {
        return whole;
      }
      changed = true;
      return `${prefix}${expected}${suffix}`;
    }
  );

  // Шаблонная форма: «выступающий в категории «Лёгкий вес»» — тоже утверждение
  // о текущем дивизионе, правится так же безопасно.
  const expectedNominative = DIVISION_NOMINATIVE[weightClass];
  if (expectedNominative) {
    next = next.replace(/(в\s+категории\s+«)([^»]+)(»)/g, (whole, prefix, name, suffix) => {
      const folded = foldYo(name);
      const isKnown = KNOWN_NOMINATIVE.some((form) => foldYo(form) === folded);
      if (!isKnown || folded === foldYo(expectedNominative)) {
        return whole;
      }
      changed = true;
      return `${prefix}${expectedNominative}${suffix}`;
    });
  }

  return { text: next, changed };
}

// Упоминания дивизиона вне настоящего времени: правкой не трогаем,
// но показываем — среди них бывают и настоящие ошибки.
function findUnsafeWeightMentions(text, weightClass) {
  const expectedStem = DIVISION_STEMS[weightClass];
  if (!expectedStem) {
    return [];
  }

  // Тот же критерий, что в аудите качества: самый длинный корень дивизиона,
  // найденный в тексте. Если после автоправки он всё ещё расходится с полем —
  // упоминание сидит в обороте, который машинально трогать нельзя.
  const folded = foldYo(text);
  const bioStem = [...new Set(Object.values(DIVISION_STEMS))]
    .sort((left, right) => right.length - left.length)
    .find((stem) => folded.includes(stem));

  if (!bioStem || bioStem === expectedStem) {
    return [];
  }

  const context = folded.match(new RegExp(`.{0,40}${bioStem}[а-яё]*\\s+вес\\S*`));
  return context ? [context[0].trim()] : [bioStem];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fighters = await prisma.fighter.findMany({
    select: { id: true, slug: true, bio: true, record: true, weightClass: true }
  });

  const updates = [];
  const manualReview = [];
  const samples = [];

  for (const fighter of fighters) {
    const original = String(fighter.bio || "");
    if (!original.trim()) {
      continue;
    }

    const recordStep = fixRecordInBio(original, fighter.record);
    const weightStep = fixWeightClassInBio(recordStep.text, fighter.weightClass);

    if (recordStep.changed || weightStep.changed) {
      updates.push({ id: fighter.id, slug: fighter.slug, bio: weightStep.text });
      if (samples.length < 6) {
        samples.push({ slug: fighter.slug, before: original.slice(0, 150), after: weightStep.text.slice(0, 150) });
      }
    }

    const unsafe = findUnsafeWeightMentions(weightStep.text, fighter.weightClass);
    if (unsafe.length > 0) {
      manualReview.push({ slug: fighter.slug, weightClass: fighter.weightClass, mentions: unsafe.slice(0, 2) });
    }
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          wouldFix: updates.length,
          needsManualReview: manualReview.length,
          samples,
          manualReviewSamples: manualReview.slice(0, 10)
        },
        null,
        1
      )
    );
    return;
  }

  for (const update of updates) {
    await prisma.fighter.update({ where: { id: update.id }, data: { bio: update.bio } });
  }

  console.log(
    JSON.stringify(
      { mode: "apply", fixed: updates.length, needsManualReview: manualReview.length, manualReview },
      null,
      1
    )
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { fixRecordInBio, fixWeightClassInBio, findUnsafeWeightMentions };
