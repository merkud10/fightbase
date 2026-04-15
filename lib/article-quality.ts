
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function replaceAllInsensitive(value: string, search: string, replacement: string) {
  if (!search.trim()) {
    return value;
  }

  return value.replace(new RegExp(`\\b${escapeRegExp(search)}\\b`, "gi"), replacement);
}

type RelatedFighter = {
  name: string;
  nameRu?: string | null;
};

const newsTermOverrides: Array<[string, string]> = [
  ["Jordan Estupinan", "Джордан Эступинан"],
  ["Aslamjon Ortikov", "Асламжон Ортиков"],
  ["Hiroba Minowa", "Хироба Минова"],
  ["Karen Ghazaryan", "Карен Газарян"],
  ["Movsar Evloev", "Мовсар Евлоев"],
  ["Lerone Murphy", "Лерон Мерфи"],
  ["Luke Riley", "Люк Райли"],
  ["Michael Aswell Jr.", "Майкл Эсвелл-младший"],
  ["Michael Venom Page", "Майкл Веном Пейдж"],
  ["Michael \"Venom\" Page", "Майкл Веном Пейдж"],
  ["Christian Leroy Duncan", "Кристиан Лерой Данкан"],
  ["Roman Dolidze", "Роман Долидзе"],
  ["Sean Strickland", "Шон Стрикленд"],
  ["Khamzat Chimaev", "Хамзат Чимаев"],
  ["Alexander Volkov", "Александр Волков"],
  ["Waldo Cortes Acosta", "Уолдо Кортес-Акоста"],
  ["Robert Whittaker", "Роберт Уиттакер"],
  ["Kamaru Usman", "Камару Усман"],
  ["Anthony Hernandez", "Энтони Эрнандес"],
  ["Israel Adesanya", "Исраэль Адесанья"],
  ["Nassourdine Imavov", "Нассурдин Имавов"],
  ["Jailton Almeida", "Жаилтон Алмейда"],
  ["Derrick Lewis", "Деррик Льюис"],
  ["Shamil Gaziev", "Шамиль Газиев"],
  ["Ante Delija", "Анте Делия"],
  ["Sergio Pettis", "Серхио Петтис"],
  ["Mitch McKee", "Митч Макки"],
  ["Jordan Newman", "Джордан Ньюман"],
  ["Josh Silveira", "Джош Силвейра"],
  ["Raufeon Stots", "Рауфеон Стотс"],
  ["Renat Khavalov", "Ренат Хавалов"],
  ["Gabriel Braga", "Габриэль Брага"],
  ["Cheyden Leialoha", "Чейден Леиалоха"],
  ["Mahdi Baydulaev", "Махди Байдулаев"],
  ["Johnny Eblen", "Джонни Эблен"],
  ["Bryan Battle", "Брайан Бэттл"],
  ["Costello van Steenis", "Костелло ван Стенис"],
  ["Impa Kasanganay", "Импа Касанганай"],
  ["Ariane Lipski da Silva", "Ариане Липски да Силва"],
  ["Sumiko Inaba", "Сумико Инаба"],
  ["Julio Arce", "Хулио Арсе"],
  ["Natan Schulte", "Натан Шулте"],
  ["Josh Fremd", "Джош Фремд"],
  ["Jarrah Al-Silawi", "Джаррах Аль-Силави"],
  ["Fred Dupras", "Фред Дюпра"],
  ["Lumpinee Stadium", "стадион Lumpinee"],
  ["Rajadamnern Stadium", "стадион Rajadamnern"]
];

const commonReplacements: Array<[RegExp, string]> = [
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
  [/\bchampionship battle\b/gi, "титульный бой"],
  [/\bFight Night\b/g, "Fight Night"],
  [/\bMMA\b/g, "MMA"],
  [/\bLumpinee Stadium\b/g, "Lumpinee Stadium"],
  [/\bRajadamnern Stadium\b/g, "Rajadamnern Stadium"]
];

function applyCommonReplacements(value: string) {
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
    .replace(/\s+-\s+/g, " — ")
    .replace(/\bUFC London\b/g, "турнир UFC London")
    .replace(/\bUFC Fight Night:\s*Evloev\s+против\s+Murphy\b/gi, "UFC Fight Night: Евлоев против Мерфи")
    .replace(/\bUFC 328:\s*ЧИМАЕВ\s+против\.\s+СТРИКЛЕНД\b/gi, "UFC 328: Чимаев против Стрикленда");

  for (const [search, replacement] of newsTermOverrides) {
    next = replaceAllInsensitive(next, search, replacement);
  }

  return next
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function applyFighterNames(value: string, fighters: RelatedFighter[]) {
  let next = value;

  for (const fighter of fighters) {
    if (!fighter.nameRu || fighter.nameRu === fighter.name) {
      continue;
    }

    next = replaceAllInsensitive(next, fighter.name, fighter.nameRu);

    const parts = fighter.name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      const [firstName, lastName] = parts;
      const [firstNameRu, lastNameRu] = fighter.nameRu.split(" ");

      if (firstName && firstNameRu) {
        next = replaceAllInsensitive(next, firstName, firstNameRu);
      }

      if (lastName && lastNameRu) {
        next = replaceAllInsensitive(next, lastName, lastNameRu);
      }
    }
  }

  return next;
}

/** Паттерны рекламных/промо абзацев источников, которые нужно вырезать. */
const PROMO_PARAGRAPH_PATTERNS = [
  /читайте\s+(metaratings|meta-ratings|мета\s*рейтинг)/i,
  /подписывайтесь\s+на\s+(наш|нас)\b/i,
  /follow\s+us\s+on\b/i,
  /stay\s+tuned\s+to\b/i,
  /subscribe\s+to\s+(our|the)\b/i,
  /чтобы\s+быть\s+в\s+курсе\s+(свежих|последних|новых)\s+новостей/i,
  /присоединяйтесь\s+к\s+(нашему|нашей|нам)\b/i,
  /не\s+пропустите\s+самые\s+(важные|интересные|свежие)/i,
  /больше\s+новостей\s+(на|в)\s+(нашем|канале|сайте)/i,
  /для\s+получения\s+(свежих|последних|актуальных)\s+новостей/i,
];

/** Source-credit строки типа «Источник: MMAJunkie» — вырезаем только если абзац короткий. */
const SOURCE_CREDIT_PATTERNS = [
  /fightnews\.info/i,
  /mmafighting\.com/i,
  /sherdog\.com/i,
  /mmajunkie/i,
];

const SOURCE_CREDIT_MAX_LENGTH = 160;

function removePromoParas(text: string): string {
  return text
    .split(/\n\n+/)
    .filter((para) => {
      if (PROMO_PARAGRAPH_PATTERNS.some((rx) => rx.test(para))) return false;
      if (para.length <= SOURCE_CREDIT_MAX_LENGTH && SOURCE_CREDIT_PATTERNS.some((rx) => rx.test(para))) {
        return false;
      }
      return true;
    })
    .join("\n\n");
}

export function cleanNewsText(value: string, fighters: RelatedFighter[] = []) {
  return removePromoParas(applyFighterNames(applyCommonReplacements(value), fighters));
}

export function cleanNewsTitle(value: string, fighters: RelatedFighter[] = []) {
  let next = cleanNewsText(value, fighters);

  next = next
    .replace(/\bРезультат(ы)? основного боя\b/gi, "Результат главного боя")
    .replace(/\bГлавные моменты и победители\b/gi, "главные итоги турнира")
    .replace(/\bПолный результат турнира\b/gi, "Полные результаты турнира")
    .replace(/\bРезультаты турнира UFC London: главные итоги\b/gi, "Результаты турнира UFC London: главные итоги")
    .replace(/\bРезультаты UFC London: .*главные итоги турнира\b/gi, "Результаты турнира UFC London: главные итоги")
    .replace(/\bБоевой поход за титул среднего веса: Чимаев против Стрикленда возглавит UFC 328\b/gi, "Чимаев и Стрикленд возглавят UFC 328")
    .replace(/\bUFC объявляет ABC в качестве консультантов по регулированию исторического турнира UFC в Белом доме\b/gi, "ABC станет регуляторным консультантом турнира UFC в Белом доме");

  return normalizeWhitespace(next);
}

export function buildRussianMeaningBlock(articleText: string) {
  const excerpt = normalizeWhitespace(articleText).slice(0, 160).trimEnd();
  return excerpt ? `Почему это важно: ${excerpt}${excerpt.length >= 160 ? "..." : ""}` : "";
}
