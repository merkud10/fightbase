CREATE TABLE "IngestSeenUrl" (
    "url" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "articleId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestSeenUrl_pkey" PRIMARY KEY ("url")
);

CREATE INDEX "IngestSeenUrl_createdAt_idx" ON "IngestSeenUrl"("createdAt");

ALTER TABLE "SourceDiscoveryRun" ADD COLUMN "skippedSeen" INTEGER NOT NULL DEFAULT 0;

-- Уже опубликованные статьи: Source.url у них и есть ссылка источника.
INSERT INTO "IngestSeenUrl" ("url", "outcome", "articleId", "updatedAt")
SELECT DISTINCT ON (s."url") s."url", 'article', a."id", CURRENT_TIMESTAMP
FROM "Source" s
JOIN "ArticleSource" x ON x."sourceId" = s."id"
JOIN "Article" a ON a."id" = x."articleId"
WHERE s."url" LIKE 'http%'
ORDER BY s."url", a."createdAt"
ON CONFLICT ("url") DO NOTHING;
