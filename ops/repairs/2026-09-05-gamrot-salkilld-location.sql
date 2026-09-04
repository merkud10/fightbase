-- Fill the missing location reported by Google Search Console.
-- Source: https://www.ufc.com/news/ufc-fight-night-gamrot-vs-salkilld-official-scorecards-judges
-- UFC confirms Meta APEX, Las Vegas, Nevada, August 8, 2026.
-- Run against the deployed site's database. Safe to repeat; known values are preserved.
-- PostgreSQL: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/repairs/2026-09-05-gamrot-salkilld-location.sql

UPDATE "Event"
SET "venue" = CASE
      WHEN UPPER(TRIM(COALESCE("venue", ''))) IN ('', 'TBD') THEN 'Meta APEX'
      ELSE "venue"
    END,
    "city" = CASE
      WHEN UPPER(TRIM(COALESCE("city", ''))) IN ('', 'TBD') THEN 'Las Vegas, Nevada, United States'
      ELSE "city"
    END
WHERE "slug" = 'ufc-fight-night-gamrot-vs-salkilld'
  AND (
    UPPER(TRIM(COALESCE("venue", ''))) IN ('', 'TBD')
    OR UPPER(TRIM(COALESCE("city", ''))) IN ('', 'TBD')
  );

SELECT "slug", "venue", "city"
FROM "Event"
WHERE "slug" = 'ufc-fight-night-gamrot-vs-salkilld';
