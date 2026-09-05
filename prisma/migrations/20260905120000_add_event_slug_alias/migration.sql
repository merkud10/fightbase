CREATE TABLE "EventSlugAlias" (
    "slug" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSlugAlias_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "EventSlugAlias_eventId_idx" ON "EventSlugAlias"("eventId");

ALTER TABLE "EventSlugAlias" ADD CONSTRAINT "EventSlugAlias_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
