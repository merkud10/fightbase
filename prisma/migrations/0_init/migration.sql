warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('news', 'analysis', 'interview', 'feature', 'video');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'review', 'published');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('upcoming', 'live', 'completed');

-- CreateEnum
CREATE TYPE "FighterStatus" AS ENUM ('active', 'champion', 'retired', 'prospect');

-- CreateEnum
CREATE TYPE "FightStage" AS ENUM ('main_card', 'prelims', 'early_prelims');

-- CreateEnum
CREATE TYPE "FightStatus" AS ENUM ('scheduled', 'completed');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('official', 'interview', 'social', 'press_release', 'stats');

-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('running', 'success', 'partial', 'failed', 'dry_run');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fighter" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameRu" TEXT,
    "nickname" TEXT,
    "photoUrl" TEXT,
    "country" TEXT NOT NULL,
    "weightClass" TEXT NOT NULL,
    "status" "FighterStatus" NOT NULL,
    "record" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "reachCm" INTEGER NOT NULL,
    "winsByKnockout" INTEGER,
    "winsBySubmission" INTEGER,
    "winsByDecision" INTEGER,
    "sigStrikesLandedPerMin" DOUBLE PRECISION,
    "strikeAccuracy" INTEGER,
    "sigStrikesAbsorbedPerMin" DOUBLE PRECISION,
    "strikeDefense" INTEGER,
    "takedownAveragePer15" DOUBLE PRECISION,
    "takedownAccuracy" INTEGER,
    "takedownDefense" INTEGER,
    "submissionAveragePer15" DOUBLE PRECISION,
    "averageFightTime" TEXT,
    "team" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "bioEn" TEXT,
    "promotionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fighter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FighterRecentFight" (
    "id" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "opponentNameRu" TEXT,
    "eventName" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "method" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "round" INTEGER,
    "time" TEXT,
    "weightClass" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FighterRecentFight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fight" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "stage" "FightStage" NOT NULL,
    "weightClass" TEXT NOT NULL,
    "status" "FightStatus" NOT NULL,
    "winnerFighterId" TEXT,
    "method" TEXT,
    "resultRound" INTEGER,
    "resultTime" TEXT,
    "eventId" TEXT NOT NULL,
    "fighterAId" TEXT NOT NULL,
    "fighterBId" TEXT NOT NULL,
    "oddsA" DOUBLE PRECISION,
    "oddsB" DOUBLE PRECISION,
    "oddsSource" TEXT,
    "oddsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightPredictionSnapshot" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "headlineRu" TEXT NOT NULL,
    "headlineEn" TEXT NOT NULL,
    "titleTagRu" TEXT NOT NULL,
    "titleTagEn" TEXT NOT NULL,
    "metaDescriptionRu" TEXT NOT NULL,
    "metaDescriptionEn" TEXT NOT NULL,
    "excerptRu" TEXT NOT NULL,
    "excerptEn" TEXT NOT NULL,
    "pickRu" TEXT NOT NULL,
    "pickEn" TEXT NOT NULL,
    "confidenceLabelRu" TEXT NOT NULL,
    "confidenceLabelEn" TEXT NOT NULL,
    "overviewRu" TEXT NOT NULL,
    "overviewEn" TEXT NOT NULL,
    "keyEdgeRu" TEXT NOT NULL,
    "keyEdgeEn" TEXT NOT NULL,
    "fightScriptRu" TEXT NOT NULL,
    "fightScriptEn" TEXT NOT NULL,
    "formARu" TEXT NOT NULL,
    "formAEn" TEXT NOT NULL,
    "formBRu" TEXT NOT NULL,
    "formBEn" TEXT NOT NULL,
    "pathARu" TEXT NOT NULL,
    "pathAEn" TEXT NOT NULL,
    "pathBRu" TEXT NOT NULL,
    "pathBEn" TEXT NOT NULL,
    "statLinesRu" TEXT NOT NULL,
    "statLinesEn" TEXT NOT NULL,
    "percentA" INTEGER NOT NULL,
    "percentB" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceOddsUpdatedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "browserPushNotifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FightPredictionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserPushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLoginAudit" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "attemptedEmail" TEXT,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "requestId" TEXT,
    "path" TEXT,
    "ipAddress" TEXT,
    "meta" TEXT,
    "telegramAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'queued',
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "coverImageAlt" TEXT,
    "excerpt" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "category" "ArticleCategory" NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "aiConfidence" DOUBLE PRECISION,
    "ingestionSourceSummary" TEXT,
    "ingestionNotes" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "browserPushNotifiedAt" TIMESTAMP(3),
    "telegramPostedAt" TIMESTAMP(3),
    "vkPostedAt" TIMESTAMP(3),
    "promotionId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSection" (
    "id" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "ArticleFighter" (
    "articleId" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,

    CONSTRAINT "ArticleFighter_pkey" PRIMARY KEY ("articleId","fighterId")
);

-- CreateTable
CREATE TABLE "ArticleSource" (
    "articleId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("articleId","sourceId")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL,
    "filePath" TEXT,
    "baseUrl" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_slug_key" ON "Promotion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Fighter_slug_key" ON "Fighter"("slug");

-- CreateIndex
CREATE INDEX "Fighter_promotionId_idx" ON "Fighter"("promotionId");

-- CreateIndex
CREATE INDEX "Fighter_status_idx" ON "Fighter"("status");

-- CreateIndex
CREATE INDEX "Fighter_weightClass_idx" ON "Fighter"("weightClass");

-- CreateIndex
CREATE INDEX "FighterRecentFight_fighterId_idx" ON "FighterRecentFight"("fighterId");

-- CreateIndex
CREATE INDEX "FighterRecentFight_date_idx" ON "FighterRecentFight"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_promotionId_idx" ON "Event"("promotionId");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Fight_slug_key" ON "Fight"("slug");

-- CreateIndex
CREATE INDEX "Fight_eventId_idx" ON "Fight"("eventId");

-- CreateIndex
CREATE INDEX "Fight_fighterAId_idx" ON "Fight"("fighterAId");

-- CreateIndex
CREATE INDEX "Fight_fighterBId_idx" ON "Fight"("fighterBId");

-- CreateIndex
CREATE INDEX "Fight_status_idx" ON "Fight"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FightPredictionSnapshot_fightId_key" ON "FightPredictionSnapshot"("fightId");

-- CreateIndex
CREATE INDEX "FightPredictionSnapshot_eventId_idx" ON "FightPredictionSnapshot"("eventId");

-- CreateIndex
CREATE INDEX "FightPredictionSnapshot_generatedAt_idx" ON "FightPredictionSnapshot"("generatedAt");

-- CreateIndex
CREATE INDEX "FightPredictionSnapshot_browserPushNotifiedAt_idx" ON "FightPredictionSnapshot"("browserPushNotifiedAt");

-- CreateIndex
CREATE INDEX "FightPredictionSnapshot_updatedAt_idx" ON "FightPredictionSnapshot"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserPushSubscription_endpoint_key" ON "BrowserPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "BrowserPushSubscription_isActive_idx" ON "BrowserPushSubscription"("isActive");

-- CreateIndex
CREATE INDEX "BrowserPushSubscription_lastSeenAt_idx" ON "BrowserPushSubscription"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AdminLoginAudit_email_idx" ON "AdminLoginAudit"("email");

-- CreateIndex
CREATE INDEX "AdminLoginAudit_wasSuccessful_idx" ON "AdminLoginAudit"("wasSuccessful");

-- CreateIndex
CREATE INDEX "AdminLoginAudit_createdAt_idx" ON "AdminLoginAudit"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_level_idx" ON "SystemEvent"("level");

-- CreateIndex
CREATE INDEX "SystemEvent_category_idx" ON "SystemEvent"("category");

-- CreateIndex
CREATE INDEX "SystemEvent_telegramAlertedAt_idx" ON "SystemEvent"("telegramAlertedAt");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAt_priority_idx" ON "BackgroundJob"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_createdAt_idx" ON "BackgroundJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_browserPushNotifiedAt_idx" ON "Article"("browserPushNotifiedAt");

-- CreateIndex
CREATE INDEX "Article_telegramPostedAt_idx" ON "Article"("telegramPostedAt");

-- CreateIndex
CREATE INDEX "Article_vkPostedAt_idx" ON "Article"("vkPostedAt");

-- CreateIndex
CREATE INDEX "Article_category_idx" ON "Article"("category");

-- CreateIndex
CREATE INDEX "Article_promotionId_idx" ON "Article"("promotionId");

-- CreateIndex
CREATE INDEX "Article_eventId_idx" ON "Article"("eventId");

-- CreateIndex
CREATE INDEX "ArticleSection_articleId_idx" ON "ArticleSection"("articleId");

-- CreateIndex
CREATE INDEX "IngestionRun_status_idx" ON "IngestionRun"("status");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Fighter" ADD CONSTRAINT "Fighter_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FighterRecentFight" ADD CONSTRAINT "FighterRecentFight_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_fighterAId_fkey" FOREIGN KEY ("fighterAId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_fighterBId_fkey" FOREIGN KEY ("fighterBId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightPredictionSnapshot" ADD CONSTRAINT "FightPredictionSnapshot_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightPredictionSnapshot" ADD CONSTRAINT "FightPredictionSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSection" ADD CONSTRAINT "ArticleSection_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleFighter" ADD CONSTRAINT "ArticleFighter_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleFighter" ADD CONSTRAINT "ArticleFighter_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "Fighter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

