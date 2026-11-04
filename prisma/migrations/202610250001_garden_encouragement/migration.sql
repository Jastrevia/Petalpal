-- Daily Garden encouragement: one Support and one note per visitor, Garden owner and
-- visitor-local calendar day. Kept apart from VisitRecord (presence history) and Message
-- (Flower-bound, unlimited) so the unique index alone enforces the daily limits.
CREATE TABLE "GardenEncouragement" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "text" VARCHAR(200),
    "localDate" VARCHAR(10) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GardenEncouragement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GardenEncouragement_kind_check" CHECK ("kind" IN ('SUPPORT', 'MESSAGE')),
    CONSTRAINT "GardenEncouragement_text_check" CHECK (
        ("kind" = 'SUPPORT' AND "text" IS NULL) OR
        ("kind" = 'MESSAGE' AND "text" IS NOT NULL AND char_length(btrim("text")) > 0)
    ),
    CONSTRAINT "GardenEncouragement_not_self_check" CHECK ("senderId" <> "ownerId")
);

CREATE UNIQUE INDEX "GardenEncouragement_senderId_ownerId_kind_localDate_key"
    ON "GardenEncouragement"("senderId", "ownerId", "kind", "localDate");

CREATE INDEX "GardenEncouragement_ownerId_kind_createdAt_idx"
    ON "GardenEncouragement"("ownerId", "kind", "createdAt");

ALTER TABLE "GardenEncouragement" ADD CONSTRAINT "GardenEncouragement_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GardenEncouragement" ADD CONSTRAINT "GardenEncouragement_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
