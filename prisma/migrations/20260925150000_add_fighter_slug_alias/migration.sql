CREATE TABLE "FighterSlugAlias" (
    "slug" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FighterSlugAlias_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "FighterSlugAlias_fighterId_idx" ON "FighterSlugAlias"("fighterId");

ALTER TABLE "FighterSlugAlias" ADD CONSTRAINT "FighterSlugAlias_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
