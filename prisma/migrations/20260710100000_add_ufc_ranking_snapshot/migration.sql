CREATE TABLE "UfcRankingSnapshot" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UfcRankingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UfcRankingSnapshot_key_key" ON "UfcRankingSnapshot"("key");
CREATE INDEX "UfcRankingSnapshot_fetchedAt_idx" ON "UfcRankingSnapshot"("fetchedAt");
