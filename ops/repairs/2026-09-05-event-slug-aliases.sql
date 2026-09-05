-- Алиасы старых слагов турниров, которые Google показывал в выдаче, а сайт отдавал 404
-- (Search Console за июнь–сентябрь 2026). Префиксные случаи («ufc-330», «…-horiguchi»)
-- страница восстанавливает сама; здесь только полностью переименованные.
-- Безопасно повторять. Требует таблицу EventSlugAlias (миграция 20260905120000).
-- PostgreSQL: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/repairs/2026-09-05-event-slug-aliases.sql

INSERT INTO "EventSlugAlias" ("slug", "eventId")
SELECT v.old_slug, e."id"
FROM (VALUES
  ('ufc-fight-night-paris',                  'ufc-fight-night-hooker-vs-parnasse'),
  ('ufc-fight-night-ankalaev-vs-rountree-jr','ufc-fight-night-ankalaev-vs-guskov'),
  ('noche-ufc-rodriguez-vs-silva',           'noche-ufc-silva-vs-delgado')
) AS v(old_slug, new_slug)
JOIN "Event" e ON e."slug" = v.new_slug
ON CONFLICT ("slug") DO UPDATE SET "eventId" = EXCLUDED."eventId";
