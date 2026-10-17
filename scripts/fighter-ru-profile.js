// Проверка русского имени и биографии, которые пишет ИИ для новичков ближайших
// турниров (scripts/localize-upcoming-fighters.js). По запросам-именам новичков
// («франсиско прадо боец», «дамиан пинас») карточка — один из немногих ответов
// в выдаче, поэтому кривое имя хуже английского: его никто так не ищет.

const CYRILLIC_NAME = /^[А-ЯЁ][А-ЯЁа-яё'’-]*(?:\s+[А-ЯЁа-яё][А-ЯЁа-яё'’.-]*)*$/;

function countNameTokens(name) {
  return String(name || "")
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Имя из модели берём, только если оно целиком кириллическое и в нём столько же
// слов, сколько в английском (суффикс Jr./III не считаем): «Javad Mahjoub» →
// «Джавад Махджуб», а не «Боец Джавад Махджуб из Канады».
function isAcceptableRussianName(nameRu, name) {
  const value = String(nameRu || "").trim();
  if (!CYRILLIC_NAME.test(value)) return false;
  return Math.abs(countNameTokens(value) - countNameTokens(name)) <= 1 && countNameTokens(value) >= 1;
}

// Биография от gpt-6.1-sol с поиском: ловим только явный брак, а не стиль.
// Названия промоушенов и клубов по-русски пишут латиницей (Road FC, Fight Club
// Rush, Cage Warriors) — их сколько угодно. Строчная латиница значит, что в текст
// попала английская фраза. Совпадение фамилии не требуем: модель иногда пишет её
// в другом варианте («Ён»/«Янг»), а имя и так стоит в заголовке карточки.
function isAcceptableRussianBio(bio) {
  const text = String(bio || "").trim();
  if (text.length < 80 || text.length > 1500) return false;
  if (!/[А-ЯЁа-яё]/.test(text)) return false;
  const latinWords = text.match(/[A-Za-z]{2,}/g) || [];
  return !latinWords.some((word) => /^[a-z]/.test(word));
}

// Шаблон buildGenericBio («X — профессиональный боец UFC, выступающий в категории
// «…». В профиле бойца указана страна…»): у бойцов ближайших турниров его
// заменяем текстом модели, как пустую биографию.
function isTemplateBio(bio) {
  return /— профессиональный боец UFC, выступающий в категории/.test(String(bio || ""));
}

// С веб-поиском модель ставит ссылки на источники: «… удушающим ([LFA](https://…))»
// или отдельной фразой «Данные подтверждают [профиль UFC](…) и […](…).». Ссылки в
// скобках убираем, предложения из одних источников выбрасываем, голые адреса тоже.
function cleanAiBio(bio) {
  const LINK = "\u0000";
  // Точки внутри адресов ломают разбивку на предложения, поэтому сначала ссылки
  // превращаются в метку, а голые адреса удаляются.
  const marked = String(bio || "")
    .replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)(?:\s*,\s*\[[^\]]*\]\([^)]*\))*\s*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, LINK)
    .replace(/https?:\/\/\S+/g, "");
  const sentences = marked.match(/[^.!?]+[.!?]*/g) || [];
  return sentences
    .filter((sentence) => !sentence.includes(LINK) && !/источник/i.test(sentence))
    .join("")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { cleanAiBio, isAcceptableRussianBio, isAcceptableRussianName, isTemplateBio };
