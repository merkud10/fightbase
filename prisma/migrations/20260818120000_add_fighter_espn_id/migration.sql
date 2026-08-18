ALTER TABLE "Fighter" ADD COLUMN "espnId" TEXT;

CREATE UNIQUE INDEX "Fighter_espnId_key" ON "Fighter"("espnId");
