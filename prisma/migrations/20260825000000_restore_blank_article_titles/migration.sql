-- Починка семи статей, у которых cleanNewsTitle обнулил title: заголовок
-- прогонялся через логику вырезания абзацев и целиком совпадал с паттерном
-- подписи об источнике («Источник: …», «Фото: …», слово «чемпионат»).
-- Причина устранена в lib/article-quality.ts, здесь восстанавливаются уже
-- сохранённые записи: исходные заголовки в базе не хранились, текст
-- восстановлен по слагу и лиду.
--
-- Условие title = '' оставляет нетронутыми статьи, которым заголовок уже
-- вернули руками, и делает повторный прогон безопасным.

UPDATE "Article" SET "title" = 'Валентина Шевченко проведёт 14-й титульный бой в карьере на UFC 332'
WHERE "slug" = 'istochnik-valentina-shevchenko-provedyot-14-j-titulnyj-boj-v-karere-na-ufc-332' AND "title" = '';

UPDATE "Article" SET "title" = 'Волкановски и Евлоев сразятся за титул в главном событии UFC 333 в октябре'
WHERE "slug" = 'istochnik-volkanovski-i-evloev-srazyatsya-za-titul-v-glavnom-sobytii-ufc-333-v-oktyabre' AND "title" = '';

UPDATE "Article" SET "title" = 'Копылов и Готье могут встретиться на UFC 332 в октябре'
WHERE "slug" = 'istochnik-kopylov-i-gote-mogut-vstretitsya-na-ufc-332-v-oktyabre' AND "title" = '';

UPDATE "Article" SET "title" = 'Деметриус Джонсон и Алекс Перейра стали членами Зала славы UFC'
WHERE "slug" = 'foto-demetrius-dzhonson-i-aleks-perejra-stali-chlenami-zala-slavy-ufc' AND "title" = '';

UPDATE "Article" SET "title" = 'Хабиб вспомнил, как в 15 лет встретил Фёдора Емельяненко на чемпионате Дагестана'
WHERE "slug" = 'khabib-vspomnil-kak-v-15-let-vstretil-fyodora-emelyanenko-na-chempionate-dagestana' AND "title" = '';

UPDATE "Article" SET "title" = 'Илия Топурия отпраздновал победу Испании на чемпионате мира по футболу'
WHERE "slug" = 'iliya-topuriya-otprazdnoval-pobedu-ispanii-na-chempionate-mira-po-futbolu' AND "title" = '';

UPDATE "Article" SET "title" = 'Падди Пимблетт раскритиковал чемпионат мира по футболу: «Это дерьмо по сравнению с игрой „Ливерпуля“»'
WHERE "slug" = 'peddi-pimblett-raskritikoval-chempionat-mira-po-futbolu-eto-dermo-po-sravneniyu-s-igroj-liverpulya' AND "title" = '';
