CREATE TABLE "TelegramEventPost" (
    "eventId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedAt" TIMESTAMP(3),
    "unpinnedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramEventPost_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "TelegramEventPost_unpinnedAt_idx" ON "TelegramEventPost"("unpinnedAt");

ALTER TABLE "TelegramEventPost" ADD CONSTRAINT "TelegramEventPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
