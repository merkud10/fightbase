-- Русские имена бойцам карда UFC Fight Night: Hooker vs. Parnasse (05.09.2026), у которых nameRu пуст.
-- Написания по карду Спорт-Экспресса:
-- https://www.sport-express.ru/martial/mma/ufc/news/ufc-fight-night-huker-parnass-5-sentyabrya-2026-data-i-vremya-polnyy-kard-gde-smotret-translyaciyu-turnira-2451831/
-- Безопасно повторять: заполненные имена не трогаются.
-- PostgreSQL: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/repairs/2026-09-05-paris-fighter-names-ru.sql

UPDATE "Fighter" AS f
SET "nameRu" = v.name_ru
FROM (VALUES
  ('axel-sola',          'Аксель Сола'),
  ('delphine-benouaich', 'Дельфин Бенуаиш'),
  ('fabia-sintes',       'Фабия Синтес'),
  ('klaudia-sygua',      'Клаудия Сыгула'),
  ('michael-aljarouj',   'Майкл Альджаруж'),
  ('oumar-sy',           'Умар Си'),
  ('pavel-andrusca',     'Павел Андруска'),
  ('punahele-soriano',   'Пунаэле Сориано')
) AS v(slug, name_ru)
WHERE f."slug" = v.slug
  AND (f."nameRu" IS NULL OR TRIM(f."nameRu") = '');
