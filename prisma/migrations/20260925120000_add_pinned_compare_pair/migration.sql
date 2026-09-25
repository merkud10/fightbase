CREATE TABLE "PinnedComparePair" (
    "fighterAId" TEXT NOT NULL,
    "fighterBId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PinnedComparePair_pkey" PRIMARY KEY ("fighterAId","fighterBId")
);

CREATE INDEX "PinnedComparePair_fighterBId_idx" ON "PinnedComparePair"("fighterBId");

ALTER TABLE "PinnedComparePair" ADD CONSTRAINT "PinnedComparePair_fighterAId_fkey" FOREIGN KEY ("fighterAId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedComparePair" ADD CONSTRAINT "PinnedComparePair_fighterBId_fkey" FOREIGN KEY ("fighterBId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Сравнения с кликами из Google (GSC, 28 дней до 25.09.2026), которые к этому
-- дню ушли в noindex: боя в расписании нет, пара ниже топ-5 рейтинга.
-- На базе без этих бойцов вставка ничего не делает.
INSERT INTO "PinnedComparePair" ("fighterAId", "fighterBId", "reason")
SELECT LEAST(a."id", b."id"), GREATEST(a."id", b."id"), 'search-demand'
FROM (VALUES
    ('dzhek-della-maddalena', 'yaroslav-amosov'),
    ('leon-edwards', 'yaroslav-amosov'),
    ('islam-makhachev', 'yaroslav-amosov'),
    ('ilia-topuria', 'quillan-salkilld')
) AS p("slugA", "slugB")
JOIN "Fighter" a ON a."slug" = p."slugA"
JOIN "Fighter" b ON b."slug" = p."slugB"
ON CONFLICT DO NOTHING;
