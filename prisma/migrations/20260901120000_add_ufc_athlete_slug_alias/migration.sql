CREATE TABLE "UfcAthleteSlugAlias" (
    "officialSlug" TEXT NOT NULL,
    "englishSlug" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UfcAthleteSlugAlias_pkey" PRIMARY KEY ("officialSlug")
);

CREATE INDEX "UfcAthleteSlugAlias_englishSlug_idx" ON "UfcAthleteSlugAlias"("englishSlug");
