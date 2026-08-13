-- Add explicit fight-card placement and result semantics without guessing
-- historical card order. The ingestion sync will populate placement from the
-- source on its next successful run.
CREATE TYPE "FightResultType" AS ENUM ('win', 'draw', 'no_contest');

ALTER TABLE "Fight"
ADD COLUMN "boutOrder" INTEGER,
ADD COLUMN "isMainEvent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resultType" "FightResultType";

-- Existing winners are unambiguous. For winner-less completed rows, only
-- backfill draw/NC when the stored method says so; otherwise keep NULL so the
-- UI can truthfully report that the result is still being verified.
UPDATE "Fight"
SET "resultType" = 'win'
WHERE "status" = 'completed'
  AND "winnerFighterId" IS NOT NULL;

UPDATE "Fight"
SET "resultType" = 'no_contest'
WHERE "status" = 'completed'
  AND "winnerFighterId" IS NULL
  AND "method" ~* '(^|[^[:alpha:]])(no[[:space:]-]*contest|n/?c)([^[:alpha:]]|$)';

UPDATE "Fight"
SET "resultType" = 'draw'
WHERE "status" = 'completed'
  AND "winnerFighterId" IS NULL
  AND "resultType" IS NULL
  AND "method" ~* 'draw|ничь';

CREATE INDEX "Fight_eventId_isMainEvent_stage_boutOrder_idx"
ON "Fight"("eventId", "isMainEvent", "stage", "boutOrder");
