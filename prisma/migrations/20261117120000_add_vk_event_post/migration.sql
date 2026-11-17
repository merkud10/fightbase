CREATE TABLE "VkEventPost" (
    "eventId" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedAt" TIMESTAMP(3),
    "resultsPostId" INTEGER,
    "resultsPostedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkEventPost_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "VkEventPost_resultsPostedAt_idx" ON "VkEventPost"("resultsPostedAt");

ALTER TABLE "VkEventPost" ADD CONSTRAINT "VkEventPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
