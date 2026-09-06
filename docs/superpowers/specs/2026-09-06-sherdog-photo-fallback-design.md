# Добор фото бойцов из Sherdog

Дата: 2026-09-06

## Проблема

Ежедневный `cron-tasks.sh sync-roster-upcoming` (05:30 UTC) обогащает из ESPN
участников турниров на 10 дней вперёд: рекорд, антропометрию, фото. У новичков
Dana White's Contender Series и части замен на коротком уведомлении портрета в
ESPN нет (`headshot` пуст, файл по прямой ссылке 404), на UFC.com у них нет
личных страниц. Итог: на карде DWCS 08.09.2026 9 бойцов из 10 без фото, на
ближайших кардах всего 25 таких бойцов.

Sherdog доступен с прода (UFC.com и Tapology отдают 403 из дата-центра) и
имеет фото у большинства проверенных новичков. Хост `www1-cdn.sherdog.com` уже
известен `scripts/local-image-store.js`.

## Решение

Запасной источник фото: если после ESPN у бойца ближайшего турнира нет
пригодного фото, ищем его на Sherdog и сохраняем портрет локально. ESPN
остаётся основным источником; Sherdog-фото не перезаписывается, потому что
`enrichFighter` ставит фото только пустым бойцам.

## Компоненты

### `scripts/sherdog-utils.js` — чистые парсеры, без сети и БД

- `parseSearchResults(html)` → `[{ name, path, heightCm }]` из строк
  `<tr onclick="document.location='/fighter/<Name>-<id>';">`: имя из
  `<td><a href="/fighter/...">Name</a></td>`, рост из `(1.98 m)` → см.
- `parseFighterPage(html)` → `{ name, photoPath, wins, losses, heightCm }`:
  имя из `<span class="fn">`, фото из `<img itemprop="image" src="...">`,
  победы/поражения из `<div class="winloses win|lose"><span>Wins</span><span>7</span>`,
  рост из `<b itemprop="height">` + `177.8 cm`.
- `pickSearchCandidate(fighter, rows)` → строка или `{ reason }`:
  1. оставить строки, у которых `normalizeFighterName(row.name)` равно
     нормализованному имени бойца (`scripts/fighter-name-matching.js`);
  2. если ровно одна — она; если ноль — `unmatched`;
  3. если несколько и известен наш `heightCm` — оставить строки с ростом в
     пределах ±3 см; если после этого ровно одна — она, иначе `ambiguous`.
- `verifyFighterPage(fighter, page)` → `null` или причина отказа:
  - имя на странице не совпадает по нормализации → `name mismatch`;
  - `photoPath` пуст или содержит `default` → `no photo`;
  - наш `record` вида `W-L-D` и `page.wins` известны, а `|W − wins| > 1`
    → `record mismatch` (ESPN и Sherdog расходятся на один бой из-за
    разного учёта, больше — скорее всего другой человек).
- `buildPhotoSourceUrls(photoPath)` → `[originalUrl, cropUrl]`:
  `https://www1-cdn.sherdog.com/_images/fighter/<file>` и
  `https://www.sherdog.com<photoPath>`. Скрипт пробует оригинал, потом кроп.

Все функции покрываются тестами `tests/sherdog-utils.test.ts` на встроенных
HTML-фрагментах (строка поиска, шапка страницы с фото, страница с
`fighter_default`, расхождение рекорда, два однофамильца с разным ростом).

### `scripts/fill-fighter-photos-from-sherdog.js` — CLI

```
node scripts/fill-fighter-photos-from-sherdog.js [--days-back 1] [--days-forward 10]
  [--event <slug>] [--fighter-slug <slug>] [--limit N] [--apply]
```

- Без `--apply` сухой прогон: печатает, что нашёл бы, БД и диск не трогает.
- Выборка: бойцы из боёв турниров с `date` в `[now − daysBack, now + daysForward]`
  (или `--event`, или один `--fighter-slug`), у которых `photoUrl` не проходит
  `hasUsablePhoto` из `scripts/espn-enrich.js`. Сортировка по дате турнира.
- Для каждого: поиск `https://www.sherdog.com/stats/fightfinder?SearchTxt=<имя>`
  через `fetchText` из `scripts/fighter-import-utils.js`, затем страница бойца,
  затем `persistImageLocally({ bucket: "fighters", key: slug, sourceUrl })`,
  затем `prisma.fighter.update({ photoUrl })`. Пауза 1500 мс между запросами к
  Sherdog.
- Лог по бойцу: `[updated] slug ← /fighter/...`, `[unmatched] slug`,
  `[ambiguous] slug: N кандидатов`, `[skipped] slug: <причина>`,
  `[failed] slug: <ошибка>`.
- Итог одной строкой для cron: `Summary: updated=N unmatched=N ambiguous=N skipped=N failed=N`.
- Код выхода 1, только если кандидаты были и все закончились `failed`
  (Sherdog недоступен); отсутствие фото у части бойцов — штатно.

### `scripts/cron-tasks.sh` — задача `sync-photos-upcoming`

По образцу `sync-roster-upcoming`: запуск скрипта с `--days-back 1
--days-forward 10 --apply`, запись вывода в `cron.log`, алерт в Telegram
только при `updated > 0` («✅ Фото к ближайшим турнирам: добавлено N») или при
падении. Добавить в usage и в `scripts/README.md`.

Crontab на проде (не в git): `40 5 * * *`, через 10 минут после ESPN-синка,
до `sync-odds` в 06:00.

## Что не делаем

- Не заменяем Sherdog-фото на ESPN-портрет, когда он появится.
- Не берём другие поля (рекорд, рост) из Sherdog: их даёт ESPN.
- Не трогаем бойцов вне окна ближайших турниров; исторический добор
  запускается вручную тем же скриптом с бо́льшим `--days-back`.

## Проверка

1. `npm test` — парсеры и синтаксис cron-tasks.sh.
2. Сухой прогон на проде по `--event dana-whites-contender-series-season-10-week-5`,
   глазами сверить найденные страницы Sherdog с бойцами.
3. Прогон с `--apply`, проверка карточек на сайте. Известный нюанс: Next.js
   standalone кеширует список файлов `public/` на старте; если `/_next/image`
   отдаёт 400 на новый файл, помогает `systemctl restart fightbase`.
4. Добавить строку в crontab, убедиться на следующее утро по `cron.log`.
