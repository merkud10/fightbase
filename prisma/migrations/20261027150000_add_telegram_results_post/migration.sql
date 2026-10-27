ALTER TABLE "TelegramEventPost" ADD COLUMN "resultsMessageId" INTEGER;
ALTER TABLE "TelegramEventPost" ADD COLUMN "resultsPostedAt" TIMESTAMP(3);

CREATE INDEX "TelegramEventPost_resultsPostedAt_idx" ON "TelegramEventPost"("resultsPostedAt");
