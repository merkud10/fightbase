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

// Биография: русский текст 80–900 знаков с именем бойца внутри. Названия
// промоушенов и клубов по-русски пишут латиницей (UFC, Road FC, Cage Warriors),
// поэтому терпим до трёх латинских слов с заглавной буквы; строчная латиница или
// больше слов — признак непереведённого текста.
function isAcceptableRussianBio(bio, nameRu) {
  const text = String(bio || "").trim();
  if (text.length < 80 || text.length > 900) return false;
  const latinWords = text.replace(/\b[A-Z]{2,5}\b/g, "").match(/[A-Za-z]{2,}/g) || [];
  if (latinWords.length > 3 || latinWords.some((word) => /^[a-z]/.test(word))) return false;
  const surname = String(nameRu || "").trim().split(/\s+/).pop() || "";
  return surname.length > 0 && text.includes(surname.slice(0, Math.max(3, surname.length - 2)));
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

module.exports = { cleanAiBio, isAcceptableRussianBio, isAcceptableRussianName };
